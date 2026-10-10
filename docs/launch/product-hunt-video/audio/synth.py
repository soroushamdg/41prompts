#!/usr/bin/env python3
"""Score for the 41prompts 30-second launch film.

Reads ../cues.json (the shared cue sheet) and writes score.wav next to this
file: exactly 30.000 s, 48 kHz, stereo, 16-bit PCM. numpy only.

    python3 -I synth.py            # render score.wav
    python3 -I synth.py --verify   # render, then print the verification report

Layout of the mix
    music bus  drums, sub bass, pads, plucks, risers (sidechained to the kick,
               run through the 14-16 s dive filter, ducked under major foley)
    foley bus  every hyper-synced UI sound, sample-accurate at its cue time
    post bus   everything from the 27.0 s hit onwards, built separately so
               no tail from before the drop can leak back in after the silence
Each bus has two reverb sends (room, hall) convolved with synthetic stereo
impulse responses. Master: DC block and a gentle causal EQ, tanh saturation,
true-peak lookahead limiter with the gain matched to the loudness target,
then the cut and end-fade masks (applied last, so the drop is exact zeros).
"""
import json
import os
import shutil
import subprocess
import sys
import wave

import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
CUES_PATH = os.path.join(HERE, "..", "cues.json")
OUT_PATH = os.path.join(HERE, "score.wav")

with open(CUES_PATH) as fh:
    CUES = json.load(fh)
MUSIC = CUES["music"]
assert MUSIC["sample_rate"] == SR
LENGTH_S = float(MUSIC["length_s"])
N = int(round(LENGTH_S * SR))  # 1,440,000 frames

_sil = [e for e in CUES["events"] if e["kind"] == "silence"][0]
CUT_T = float(_sil["t"])  # 25.5: everything stops dead
HIT_T = CUT_T + float(_sil["dur"])  # 27.0: massive hit
FADE_T = 29.0  # final chord fades from here to a silent last sample
TARGET_LUFS = -14.0
CEILING_DBTP = -1.5
BEAT = float(MUSIC["beat_s"])
BAR = float(MUSIC["bar_s"])
PROG = MUSIC["progression_from_4s"]

_seed_counter = [4100]


def nseed():
    _seed_counter[0] += 1
    return _seed_counter[0]


# ------------------------------------------------------------------ basics
def ns(sec):
    return int(round(sec * SR))


def tt(n):
    return np.arange(n) / SR


def next_pow2(n):
    return 1 << int(n - 1).bit_length()


_PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
       "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(name):
    midi = 12 * (int(name[-1]) + 1) + _PC[name[:-1]]
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def pan2(sig, pan=0.0):
    """Constant-power pan normalised so centre keeps full level per channel."""
    th = (np.asarray(pan) + 1.0) * np.pi / 4.0
    return np.stack([sig * np.cos(th) * np.sqrt(2), sig * np.sin(th) * np.sqrt(2)])


def st(sig, pan=0.0):
    return pan2(sig, pan) if sig.ndim == 1 else sig


def fade_out(sig, sec):
    k = min(ns(sec), sig.shape[-1])
    if k > 1:
        sig[..., -k:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, k)))
    return sig


def fade_in(sig, sec):
    k = min(ns(sec), sig.shape[-1])
    if k > 1:
        sig[..., :k] *= 0.5 * (1 - np.cos(np.linspace(0, np.pi, k)))
    return sig


def haas(sig2, ms, ch=1):
    d = ns(ms / 1000.0)
    out = sig2.copy()
    out[ch, d:] = sig2[ch, :-d]
    out[ch, :d] = 0.0
    return out


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- filters
def hp_mag(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def lp_mag(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def band_mag(f, lo=None, hi=None, order=2):
    m = np.ones_like(f)
    if lo:
        m = m * hp_mag(f, lo, order)
    if hi:
        m = m * lp_mag(f, hi, order)
    return m


def spec_filter(x, mag, pad=4096):
    """Zero-phase magnitude filter in the frequency domain. Only used on
    material that is enveloped afterwards (noise, oscillators, delay
    returns), so the symmetric impulse never pre-rings onto the timeline."""
    n = x.shape[-1]
    nfft = next_pow2(n + pad)
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    return np.fft.irfft(np.fft.rfft(x, nfft, axis=-1) * mag(f), nfft, axis=-1)[..., :n]


def fnoise(n, lo=None, hi=None, order=2, seed=None, ch=1):
    """Band-limited white noise at unit RMS (filtered with margin, then trimmed)."""
    r = np.random.default_rng(nseed() if seed is None else seed)
    pad = 8192
    x = r.standard_normal((ch, n + 2 * pad))
    if lo or hi:
        x = spec_filter(x, lambda f: band_mag(f, lo, hi, order))
    x = x[:, pad:pad + n]
    x /= np.sqrt(np.mean(x ** 2, axis=1, keepdims=True)) + 1e-12
    return x[0] if ch == 1 else x


def svf(x, fc, q=0.707, mode="bp"):
    """Topology-preserving state-variable filter with per-sample cutoff and Q
    (Zavalishin). Causal; 'bp' is normalised to unity peak gain."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    k = np.broadcast_to(1.0 / np.asarray(q, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(fc, 5.0, 0.49 * SR) / SR)
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3, K = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist(), k.tolist()
    ic1 = ic2 = 0.0
    out = [0.0] * n
    if mode == "lp":
        for i in range(n):
            v3 = xs[i] - ic2
            v1 = A1[i] * ic1 + A2[i] * v3
            v2 = ic2 + A2[i] * ic1 + A3[i] * v3
            ic1 = 2.0 * v1 - ic1
            ic2 = 2.0 * v2 - ic2
            out[i] = v2
    elif mode == "bp":
        for i in range(n):
            v3 = xs[i] - ic2
            v1 = A1[i] * ic1 + A2[i] * v3
            v2 = ic2 + A2[i] * ic1 + A3[i] * v3
            ic1 = 2.0 * v1 - ic1
            ic2 = 2.0 * v2 - ic2
            out[i] = K[i] * v1
    else:  # hp
        for i in range(n):
            v3 = xs[i] - ic2
            v1 = A1[i] * ic1 + A2[i] * v3
            v2 = ic2 + A2[i] * ic1 + A3[i] * v3
            ic1 = 2.0 * v1 - ic1
            ic2 = 2.0 * v2 - ic2
            out[i] = xs[i] - K[i] * v1 - v2
    return np.array(out)


def svf2(x2, fc, q=0.707, mode="bp"):
    return np.stack([svf(x2[0], fc, q, mode), svf(x2[1], fc, q, mode)])


def biquad_resp(b, a, z):
    return (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)


def iir_fft(x, sections, pad=SR):
    """Causal biquad cascade applied exactly through its frequency response
    (zero-padded so the decaying impulse response never wraps)."""
    n = x.shape[-1]
    nfft = next_pow2(n + pad)
    z = np.exp(-2j * np.pi * np.fft.rfftfreq(nfft))
    H = np.ones_like(z)
    for b, a in sections:
        H = H * biquad_resp(b, a, z)
    return np.fft.irfft(np.fft.rfft(x, nfft, axis=-1) * H, nfft, axis=-1)[..., :n]


DC_BLOCK = ([1.0, -1.0, 0.0], [1.0, -0.9995, 0.0])  # ~3.8 Hz one-pole high-pass


def peaking(f0, gain_db, q):
    """RBJ cookbook peaking EQ biquad (b, a), normalised."""
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    b = np.array([1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A])
    a = np.array([1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A])
    return list(b / a[0]), list(a / a[0])


# master tone: a little low-mid warmth, a little less 2-3 kHz bite (causal, so no pre-ring)
MASTER_EQ = [DC_BLOCK, peaking(210.0, 2.0, 0.7), peaking(2700.0, -1.5, 1.2)]


# ------------------------------------------------------------- oscillators
TL = 4096
_tab_cache = {}


def saw_table(f0, cutoff, order=2, fmax=17000.0):
    """Band-limited saw cycle with a smooth low-pass baked into its harmonics.
    `fmax` caps the top harmonic (lower it when the pitch will be swept up)."""
    key = (round(f0, 3), round(cutoff, 1), order, fmax)
    if key not in _tab_cache:
        kmax = max(1, min(int(fmax // f0), TL // 2 - 1))
        k = np.arange(1, kmax + 1)
        amps = (1.0 / k) / np.sqrt(1.0 + (k * f0 / cutoff) ** (2 * order))
        spec = np.zeros(TL // 2 + 1, dtype=complex)
        spec[k] = -0.5j * TL * amps
        _tab_cache[key] = np.fft.irfft(spec, TL)
    return _tab_cache[key]


def wt_osc(tab, freq, n, phase=0.0):
    if np.ndim(freq) == 0:
        ph = phase + freq * np.arange(n) / SR
    else:
        ph = phase + np.concatenate([[0.0], np.cumsum(freq[:-1])]) / SR
    pos = (ph - np.floor(ph)) * TL
    i0 = pos.astype(np.int64)
    fr = pos - i0
    i0 %= TL
    i1 = (i0 + 1) % TL
    return tab[i0] + (tab[i1] - tab[i0]) * fr


def sweep_phase(freq):
    return 2 * np.pi * np.concatenate([[0.0], np.cumsum(freq[:-1])]) / SR


def modes(n, freqs, amps, taus, phase=0.0):
    """Sum of exponentially damped sinusoids (modal synthesis)."""
    t = tt(n)
    out = np.zeros(n)
    for f, a, tau in zip(freqs, amps, taus):
        if f < 0.45 * SR:
            out += a * np.sin(2 * np.pi * f * t + phase) * np.exp(-t / tau)
    return out


# ------------------------------------------------------------------ reverb
def make_ir(rt60, length, predelay, seed, mults=(1.15, 1.0, 0.8, 0.55, 0.32)):
    """Decorrelated stereo noise impulse with band-dependent decay (high
    frequencies die first), a short diffusion build-up and a pre-delay."""
    n = ns(length)
    t = tt(n)
    r = np.random.default_rng(seed)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    xo = [250.0, 1200.0, 4000.0, 9000.0]
    lps = [1.0 / (1.0 + (f / c) ** 4) for c in xo]
    masks = [lps[0]] + [lps[i + 1] - lps[i] for i in range(len(xo) - 1)] + [1.0 - lps[-1]]
    ir = np.zeros((2, n))
    for ch in range(2):
        spec = np.fft.rfft(r.standard_normal(n))
        for m, k in zip(masks, mults):
            ir[ch] += np.fft.irfft(spec * m, n) * np.exp(-6.9078 * t / (rt60 * k))
    ir *= 1.0 - np.exp(-t / 0.01)
    fade_out(ir, 0.2)
    ir /= np.sqrt(np.mean(np.sum(ir ** 2, axis=1)))
    return np.concatenate([np.zeros((2, ns(predelay))), ir], axis=1)


IR_ROOM = make_ir(0.8, 1.4, 0.008, 11)
IR_HALL = make_ir(2.6, 3.8, 0.024, 12)


def fft_convolve(x, ir):
    n = x.shape[1]
    nfft = next_pow2(n + ir.shape[1])
    X = np.fft.rfft(x, nfft, axis=1)
    H = np.fft.rfft(ir, nfft, axis=1)
    return np.fft.irfft(X * H, nfft, axis=1)[:, :n]


class Bus:
    def __init__(self, name):
        self.name = name
        self.dry = np.zeros((2, N))
        self.room = np.zeros((2, N))
        self.hall = np.zeros((2, N))

    def add(self, t, sig, gain=1.0, pan=0.0, room=0.0, hall=0.0):
        s2 = st(sig, pan)
        i0 = ns(t)
        n = min(s2.shape[1], N - i0)
        if n <= 0:
            return
        seg = s2[:, :n] * gain
        self.dry[:, i0:i0 + n] += seg
        if room:
            self.room[:, i0:i0 + n] += room * seg
        if hall:
            self.hall[:, i0:i0 + n] += hall * seg

    def add_array(self, arr, gain=1.0, room=0.0, hall=0.0):
        self.dry += gain * arr
        if room:
            self.room += room * gain * arr
        if hall:
            self.hall += hall * gain * arr

    def render(self):
        out = self.dry.copy()
        if np.any(self.room):
            out += fft_convolve(self.room, IR_ROOM)
        if np.any(self.hall):
            out += fft_convolve(self.hall, IR_HALL)
        return out


# ===================================================================== drums
def kick(f_hi=190.0, f_lo=50.0, p_tau=0.03, hold=0.025, a_tau=0.19, dur=0.55,
         click=0.35, drive=1.8):
    n = ns(dur)
    t = tt(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / p_tau)
    body = np.sin(sweep_phase(f) + 2 * np.pi * f_hi / SR) * np.exp(-np.maximum(t - hold, 0) / a_tau)
    body = np.tanh(drive * body) / np.tanh(drive)
    ck = fnoise(n, 1200, 9000) * np.exp(-t / 0.0011)
    ck[0] = abs(ck[0]) + 1.0  # make sure the beater lands on the very first sample
    out = body + click * 0.45 * ck
    return fade_out(out, 0.01)


_cache = {}


def cached(key, fn, variants):
    lst = _cache.setdefault(key, [])
    while len(lst) < variants:
        lst.append(fn())
    return lst


def clap(nbursts=4, spread=0.0095, burst_tau=0.0032, tail_tau=0.085, tail_gain=0.7,
         lo=850.0, hi=2400.0, width=0.35, dur=0.5):
    """808-style clap: 10 ms-spaced band-passed noise bursts plus a tail. The
    first burst starts on sample 0."""
    n = ns(dur)
    t = tt(n)
    r = np.random.default_rng(nseed())
    env = np.zeros(n)
    for b in range(nbursts):
        tb = 0.0 if b == 0 else b * spread * (1.0 + 0.06 * r.standard_normal())
        i = ns(tb)
        env[i:] = np.maximum(env[i:], np.exp(-(t[i:] - t[i]) / burst_tau) * (0.8 + 0.2 * b / max(1, nbursts - 1)))
    t_tail = t[ns((nbursts - 1) * spread)]
    env = np.maximum(env, np.where(t >= t_tail, np.exp(-(t - t_tail) / tail_tau), 0.0) * tail_gain)
    mid = fnoise(n, lo, hi) * env
    side = fnoise(n, lo, hi) * env
    air = fnoise(n, 3800, 11000) * env * 0.3
    body = fnoise(n, 280, 800) * np.exp(-t / 0.018) * 0.35
    m = mid + air + body
    out = np.stack([m + width * side, m - width * side])
    pk = np.abs(out).max()
    out = np.tanh(2.2 * out / pk) / np.tanh(2.2)  # tame the burst peaks: denser, heavier clap
    return fade_out(out, 0.02)


def snap():
    n = ns(0.15)
    t = tt(n)
    crack = fnoise(n, 2500, 12000) * np.exp(-t / 0.0008)
    crack[0] = abs(crack[0]) + 0.8
    body = fnoise(n, 1200, 3600) * np.exp(-t / 0.02)
    tone = np.sin(2 * np.pi * 1850.0 * t) * np.exp(-t / 0.014)
    out = 0.7 * crack + 0.9 * body + 0.55 * tone
    pk = np.abs(out).max()
    return fade_out(np.tanh(1.8 * out / pk) / np.tanh(1.8), 0.01)


HAT_FREQS = (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)


def hat(decay=0.02, dur=0.12, metal=0.55):
    n = ns(dur)
    pad = 4096
    tl = tt(n + pad)
    r = np.random.default_rng(nseed())
    sq = sum(np.sign(np.sin(2 * np.pi * f * 1.7 * tl + r.uniform(0, 2 * np.pi))) for f in HAT_FREQS)
    sq = spec_filter(sq, lambda f: band_mag(f, 7000, 16000, 3))[pad:]
    sq /= np.sqrt(np.mean(sq ** 2)) + 1e-12
    nz = fnoise(n, 7500, 16000)
    t = tt(n)
    out = (metal * sq + (1 - metal) * nz) * np.exp(-t / decay)
    return fade_out(out, 0.006) / 3.0


def snare():
    n = ns(0.32)
    t = tt(n)
    f = 182.0 + 70.0 * np.exp(-t / 0.008)
    tone = np.sin(sweep_phase(f)) * np.exp(-t / 0.045)
    tone2 = np.sin(2 * np.pi * 336.0 * t) * np.exp(-t / 0.025) * 0.4
    wires = fnoise(n, 1500, 9500) * np.exp(-t / 0.065)
    crack = fnoise(n, 3000, 12000) * np.exp(-t / 0.002)
    crack[0] = abs(crack[0]) + 1.0
    out = 0.6 * tone + 0.3 * tone2 + 0.45 * wires + 0.5 * crack
    return fade_out(out, 0.02) / 1.6


# ============================================================ tonal layers
PAD_VOICING = {
    "Dm9": ["D3", "F3", "C4", "E4", "A4"],
    "Bbmaj7": ["Bb2", "F3", "A3", "D4", "F4"],
    "Fmaj7": ["F3", "C4", "E4", "A4"],
    "C6": ["C3", "G3", "E4", "A4"],
}
PLUCK_VOICING = {
    "Dm9": ["A4", "C5", "E5"],
    "Bbmaj7": ["F4", "A4", "D5"],
    "Fmaj7": ["E4", "A4", "C5"],
    "C6": ["G4", "A4", "E5"],
}
BASS_ROOT = {"Dm9": "D2", "Bbmaj7": "Bb1", "Fmaj7": "F2", "C6": "C2"}
BASS_FIFTH = {"Dm9": "A2", "Bbmaj7": "F2", "Fmaj7": "C3", "C6": "G2"}


def pad_chord(notes, dur, attack=0.06, release=0.35, dark=550.0, bright=1700.0,
              open_from=0.15, open_to=0.55, cents=((0, -7), (0, 3), (1, -3), (1, 7)), seed=None):
    """Detuned saw pad: two voices per channel, dark/bright wavetables
    crossfaded so the 'filter' opens slowly across the chord."""
    n = ns(dur + release + 0.02)
    t = tt(n)
    r = np.random.default_rng(nseed() if seed is None else seed)
    bm = open_from + (open_to - open_from) * smoothstep(t / max(dur, 1e-3))
    out = np.zeros((2, n))
    for name in notes:
        f = hz(name) if isinstance(name, str) else name
        td, tb = saw_table(f, dark), saw_table(f, bright)
        for ch, c in cents:
            ff = f * 2 ** (c / 1200.0)
            ph = r.random()
            out[ch] += wt_osc(td, ff, n, ph) * (1 - bm) + wt_osc(tb, ff, n, ph) * bm
    env = np.minimum(1.0, t / attack) if attack > 0 else np.ones(n)
    rel = t > dur
    env[rel] *= np.exp(-(t[rel] - dur) / (release / 3.0))
    out *= env / (len(notes) * 1.2)
    return fade_out(out, 0.02)


def bass_note(f, gate, vel):
    n = ns(gate + 0.05)
    t = tt(n)
    fe = np.exp(-t / 0.035)
    tone = 0.9 * np.sin(2 * np.pi * f * t) + 0.55 * (
        wt_osc(saw_table(f, 260.0), f, n) * (1 - fe) + wt_osc(saw_table(f, 1300.0), f, n) * fe)
    env = np.minimum(1.0, t / 0.002) * (0.55 + 0.45 * np.exp(-t / 0.12))
    after = t > gate
    env[after] *= np.exp(-(t[after] - gate) / 0.012)
    out = np.tanh(1.6 * tone * env) / np.tanh(1.6) * vel
    return fade_out(out, 0.006)


def pluck_chord(notes, vel, dur=0.7):
    n = ns(dur)
    t = tt(n)
    fe = np.exp(-t / 0.03)
    env = np.minimum(1.0, t / 0.0015) * np.exp(-t / 0.14)
    out = np.zeros((2, n))
    r = np.random.default_rng(nseed())
    for name in notes:
        f = hz(name)
        tb, td = saw_table(f, 5200.0), saw_table(f, 950.0)
        for ch, c in ((0, -6), (1, 6)):
            ff = f * 2 ** (c / 1200.0)
            ph = r.random()
            out[ch] += wt_osc(tb, ff, n, ph) * fe + wt_osc(td, ff, n, ph) * (1 - fe)
    out *= env * vel / len(notes)
    out = haas(out, 7.0, ch=1)
    return fade_out(out, 0.02)


def pingpong(x2, delay_s=0.375, fb=0.36, repeats=5):
    """Dotted-8th ping-pong return: darker, band-limited repeats alternating sides."""
    d = ns(delay_s)
    src = spec_filter(x2, lambda f: band_mag(f, 350.0, 3000.0, 1))
    out = np.zeros_like(x2)
    for k in range(1, repeats + 1):
        sh = np.zeros_like(x2)
        sh[:, k * d:] = src[:, :-k * d]
        if k % 2:
            sh = sh[::-1]
        out += fb ** k * sh
    return out


def glass(f, dur=1.6, bright=1.0, detune_c=1.5, strike=0.15):
    n = ns(dur)
    t = tt(n)
    ratios = (1.0, 2.0, 3.0, 4.16, 5.43, 6.79)
    amps = (1.0, 0.30, 0.12, 0.16 * bright, 0.08 * bright, 0.04 * bright)
    taus = (0.9, 0.42, 0.26, 0.12, 0.07, 0.045)
    out = np.zeros((2, n))
    for ch, c in ((0, -detune_c), (1, detune_c)):
        ff = f * 2 ** (c / 1200.0)
        out[ch] = modes(n, [ff * r for r in ratios], amps, taus)
    s = fnoise(n, 4000, 16000) * np.exp(-t / 0.0004) * strike
    s[0] = abs(s[0]) + strike * 2
    out += s
    return fade_out(out, 0.05)


def tick_tone(f, tau, n, harm=0.25, click=0.35):
    """Tiny UI tick: cosine-phase blip (energy on sample 0) plus an air click."""
    t = tt(n)
    tone = np.cos(2 * np.pi * f * t) * np.exp(-t / tau) + harm * np.cos(4 * np.pi * f * t) * np.exp(-t / (tau * 0.4))
    ck = fnoise(n, 4000, 15000) * np.exp(-t / 0.0005) * click
    return fade_out(tone + ck, 0.004)


# =================================================================== foley
def f_sub_swell(ev):
    dur = ev.get("dur", 2.0)
    f = hz(ev.get("note", "F1"))
    n = ns(dur + 0.4)
    t = tt(n)
    peak = 0.75 * dur
    env = np.where(t < peak, (t / peak) ** 2, 0.5 * (1 + np.cos(np.pi * np.clip((t - peak) / (dur + 0.4 - peak), 0, 1))))
    f_t = f * (1 + 0.015 * t / dur)
    ph = sweep_phase(np.full(n, 1.0) * f_t)
    tone = np.sin(ph) + 0.45 * np.sin(2 * ph) + 0.18 * np.sin(3 * ph) + 0.06 * np.sin(4 * ph)
    return np.tanh(1.3 * tone * env) / np.tanh(1.3)


def f_air_pad(ev):
    dur = ev.get("dur", 4.0)
    n = ns(dur)
    t = tt(n)
    env = smoothstep(t / 1.4) * (1 - smoothstep((t - (dur - 1.1)) / 1.1))
    breath = fnoise(n, 1800, 9500, ch=2) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.31 * t))
    shimmer = np.zeros((2, n))
    for i, name in enumerate(["F5", "C6", "G6", "A6", "E7"]):
        f = hz(name)
        am = 0.6 + 0.4 * np.sin(2 * np.pi * (0.23 + 0.11 * i) * t + i)
        a = 0.5 / (1 + 0.5 * i)
        shimmer[0] += a * am * np.sin(2 * np.pi * (f - 0.6) * t)
        shimmer[1] += a * am * np.sin(2 * np.pi * (f + 0.6) * t + 1.3)
    out = (0.22 * breath + 0.35 * shimmer) * env
    return fade_out(out, 0.05)


def f_tink(ev):
    n = ns(1.4)
    t = tt(n)
    f = 2350.0
    out = np.zeros((2, n))
    for ch, d in ((0, -0.003), (1, 0.003)):
        out[ch] = modes(n, [f * (1 + d) * r for r in (1.0, 2.756, 5.404, 8.933)],
                        [1.0, 0.55, 0.28, 0.12], [0.75, 0.32, 0.16, 0.07])
    ck = fnoise(n, 3500, 15000) * np.exp(-t / 0.0005)
    ck[0] = abs(ck[0]) + 2.0
    out += 0.5 * ck
    return fade_out(out, 0.1)


def f_reverse_whoosh(ev):
    dur = ev.get("dur", 0.6)
    n = ns(dur)
    t = tt(n)
    fwd = fnoise(n, 700, 7000, ch=2) * np.exp(-t / 0.16)
    ring = np.zeros((2, n))
    for ch, d in ((0, -0.004), (1, 0.004)):
        ring[ch] = modes(n, [3520.0 * (1 + d) * r for r in (1.0, 2.756, 5.404)], [1.0, 0.5, 0.25], [0.22, 0.1, 0.05])
    low = np.sin(2 * np.pi * 90.0 * t) * np.exp(-t / 0.2)
    fwd = 0.9 * fwd + 0.6 * ring + 0.5 * low
    rev = fwd[:, ::-1].copy()
    fade_in(rev, 0.004)
    return fade_out(rev, 0.012)


def f_kick_heartbeat(ev):
    k = kick(f_hi=100.0, f_lo=44.0, p_tau=0.045, hold=0.03, a_tau=0.17, dur=0.6, click=0.12, drive=1.4)
    return k


def f_word_tick(ev):
    soft = "soft" in ev.get("note", "")
    r = np.random.default_rng(nseed())
    f = 4300.0 * 2 ** r.uniform(-0.12, 0.12)
    out = tick_tone(f, 0.0035, ns(0.04), harm=0.2, click=0.4)
    return out * (0.9 if soft else 1.0)  # "soft" ticks sit over the held chord, which masks them more


def f_short_riser(ev):
    dur = ev.get("dur", 0.5)
    n = ns(dur)
    t = tt(n)
    u = t / dur
    fc = 500.0 * (7000.0 / 500.0) ** u
    nz = svf2(fnoise(n, ch=2), fc, 2.2, "bp")
    tone = np.sin(sweep_phase(700.0 * 4.0 ** u)) * 0.25 * u
    out = (nz + tone) * (0.3 + 0.7 * u ** 2)
    fade_in(out, 0.004)
    return fade_out(out, 0.012)


def f_scan_zip(ev):
    dur = ev.get("dur", 0.75)
    n = ns(dur)
    t = tt(n)
    u = t / dur
    fc = 700.0 * (9000.0 / 700.0) ** u
    nz = svf2(fnoise(n, ch=2), fc, 3.0, "bp") * 1.6
    rate = 35.0 * 4.0 ** u
    gate = 0.5 + 0.5 * np.tanh(4 * np.sin(sweep_phase(rate) + np.pi / 2))
    tone = np.tanh(3 * np.sin(sweep_phase(420.0 * 7.5 ** u))) * 0.18
    env = np.minimum(1.0, t / 0.0008) * (1 - smoothstep((u - 0.62) / 0.38)) * (1.0 + 0.4 * u)
    pan = -0.8 + 1.6 * u
    out = nz * (0.35 + 0.65 * gate) * env
    th = (pan + 1) * np.pi / 4
    out[0] *= np.cos(th) * np.sqrt(2)
    out[1] *= np.sin(th) * np.sqrt(2)
    out += pan2(tone * gate * env, pan)
    return fade_out(out, 0.01)


BLOK_NOTES = ["D5", "F5", "A5", "C6"]


def f_blok_clack(ev):
    i = int(ev.get("index", 0))
    f0 = hz(BLOK_NOTES[i % 4])
    n = ns(0.3)
    t = tt(n)
    click = fnoise(n, 1800, 12000) * np.exp(-t / 0.0008)
    click[0] = abs(click[0]) + 2.0
    body = modes(n, [f0, f0 * 2.32, f0 * 4.08, f0 * 6.1], [1.0, 0.5, 0.25, 0.1], [0.06, 0.03, 0.016, 0.008])
    plastic = fnoise(n, f0 * 1.5, f0 * 3.5) * np.exp(-t / 0.012) * 0.35
    thunk = np.sin(2 * np.pi * 165.0 * t) * np.exp(-t / 0.02) * 0.6
    d = ns(0.011)
    latch = np.zeros(n)
    latch[d:] = (fnoise(n - d, 2500, 13000) * np.exp(-t[:n - d] / 0.0006) * 0.55
                 + modes(n - d, [f0 * 3.1], [0.3], [0.01]))
    out = 0.7 * click + body + plastic + thunk + latch
    return fade_out(out, 0.02) / 1.6


LABEL_NOTES = ["F6", "A6", "C7", "D7"]


def f_label_snap(ev):
    k = ev["_n"]  # Context, Constraint, Example, Expects: one pitch each
    s = snap()
    n = len(s)
    f = hz(LABEL_NOTES[k % 4])
    ping = modes(n, [f, 2 * f], [0.35, 0.1], [0.05, 0.02])
    out = s * 1.6 + ping
    pan = (-0.35, 0.35, -0.2, 0.2)[k % 4]
    return pan2(out, pan)


def whoosh_body(dur, fc_curve, q, start_level=0.4, peak_at=0.5, pan_from=0.0, pan_to=0.0):
    n = ns(dur)
    t = tt(n)
    u = t / dur
    nz = svf2(fnoise(n, ch=2), fc_curve(u), q, "bp")
    env = np.where(u < peak_at, start_level + (1 - start_level) * np.sin(0.5 * np.pi * u / peak_at) ** 2,
                   np.cos(0.5 * np.pi * np.clip((u - peak_at) / (1 - peak_at), 0, 1)) ** 1.5)
    env = env * np.minimum(1.0, t / 0.004)
    puff = fnoise(n, 900, 6000, ch=2) * np.exp(-t / 0.006) * 0.5
    out = nz * env + puff
    pan = pan_from + (pan_to - pan_from) * u
    th = (pan + 1) * np.pi / 4
    out[0] *= np.cos(th) * np.sqrt(2)
    out[1] *= np.sin(th) * np.sqrt(2)
    return fade_out(out, 0.01)


def f_whoosh(ev):
    dur = ev.get("dur", 0.4)
    arc = lambda u: 380.0 * (2800.0 / 380.0) ** np.sin(np.pi * np.clip(u / 1.1, 0, 1))
    return whoosh_body(dur, arc, 1.1, 0.4, 0.55, -0.4, 0.4) * 1.4


COMPILE_NOTES = ["D6", "E6", "F6", "G6", "A6", "C7"]


def f_compile_tick(ev):
    i = int(ev.get("index", 0))
    f = hz(COMPILE_NOTES[i % len(COMPILE_NOTES)])
    n = ns(0.14)
    t = tt(n)
    blip = tick_tone(f, 0.022, n, harm=0.3, click=0.0)
    ck = fnoise(n, 3000, 14000) * np.exp(-t / 0.0005)
    ck[0] = abs(ck[0]) + 1.5
    clack = fnoise(n, 600, 2500) * np.exp(-t / 0.004) * 0.45
    return pan2(fade_out(blip + 0.6 * ck + clack, 0.01), -0.25 + 0.1 * i)


def f_flip(ev):
    n = ns(0.24)
    t = tt(n)
    c1 = fnoise(n, 1500, 10000) * np.exp(-t / 0.0007)
    c1[0] = abs(c1[0]) + 1.5
    fc = np.where(t < 0.08, 1200.0 * (5500.0 / 1200.0) ** (t / 0.08), 5500.0)
    fwip = svf(fnoise(n), fc, 1.4, "bp") * np.sin(np.pi * np.clip(t / 0.09, 0, 1)) * 0.9
    d = ns(0.085)
    c2 = np.zeros(n)
    c2[d:] = fnoise(n - d, 1200, 9000) * np.exp(-t[:n - d] / 0.0009) * 0.55
    blip = np.cos(sweep_phase(1300.0 * 2.0 ** np.clip(t / 0.06, 0, 1))) * np.exp(-t / 0.05) * 0.25
    out = 0.8 * c1 + fwip + c2 + blip
    return pan2(fade_out(out, 0.01), 0.1)


def f_cursor_glide(ev):
    dur = ev.get("dur", 0.5)
    n = ns(dur)
    t = tt(n)
    u = t / dur
    out = fnoise(n, 2500, 9000, ch=2) * np.sin(np.pi * u) ** 2
    pan = -0.4 + 0.8 * u
    th = (pan + 1) * np.pi / 4
    out[0] *= np.cos(th) * np.sqrt(2)
    out[1] *= np.sin(th) * np.sqrt(2)
    return out


def f_click(ev):
    n = ns(0.14)
    t = tt(n)
    press = fnoise(n, 2000, 14000) * np.exp(-t / 0.0006)
    press[0] = abs(press[0]) + 2.5
    res = modes(n, [3150.0, 4730.0, 1240.0], [0.6, 0.35, 0.45], [0.007, 0.004, 0.011])
    body = np.sin(2 * np.pi * 210.0 * t) * np.exp(-t / 0.009) * 0.5
    d = ns(0.045)
    rel = np.zeros(n)
    rel[d:] = (fnoise(n - d, 2500, 14000) * np.exp(-t[:n - d] / 0.0005) * 0.4
               + modes(n - d, [3900.0, 5600.0], [0.3, 0.2], [0.004, 0.003]))
    out = 0.8 * press + res + body + rel
    return fade_out(out, 0.01) / 1.5


def f_chime2(ev):
    a = glass(hz("A5"), 1.4)
    b = glass(hz("D6"), 1.4)
    d = ns(0.085)
    out = np.zeros((2, a.shape[1] + d))
    out[:, :a.shape[1]] += pan2(a.mean(axis=0), -0.25) * 0.9
    out[:, d:] += pan2(b.mean(axis=0), 0.25)
    return out


def f_whoosh_in(ev):
    dur = ev.get("dur", 0.3)
    n = ns(dur)
    t = tt(n)
    u = t / dur
    f = 2200.0 * (70.0 / 2200.0) ** (u ** 0.8)
    ph = sweep_phase(f)
    tone = (np.sin(ph) + 0.3 * np.tanh(3 * np.sin(ph))) * 0.45
    fc = 7000.0 * (250.0 / 7000.0) ** u
    nz = svf2(fnoise(n, ch=2), fc, 1.4, "bp")
    env = (0.4 + 0.6 * (u / 0.92) ** 1.5) * np.minimum(1.0, t / 0.004)
    env = np.where(u > 0.92, np.cos(0.5 * np.pi * (u - 0.92) / 0.08), env)
    out = (nz + tone) * env
    return fade_out(out, 0.004)


def f_impact(ev):
    n = ns(1.3)
    t = tt(n)
    f = 36.0 + 44.0 * np.exp(-t / 0.07)
    sub = np.sin(sweep_phase(f) + 2 * np.pi * 80.0 / SR) * np.exp(-np.maximum(t - 0.02, 0) / 0.38)
    sub = np.tanh(1.7 * sub) / np.tanh(1.7)
    trans = fnoise(n, 700, 9000) * np.exp(-t / 0.0035)
    trans[0] = abs(trans[0]) + 2.0
    thud = fnoise(n, 60, 450) * np.exp(-t / 0.035)
    mid = np.sin(2 * np.pi * 135.0 * t) * np.exp(-t / 0.07) * 0.4
    mono = 1.0 * sub + 0.5 * trans + 0.45 * thud + mid
    wide = fnoise(n, 1000, 6000, ch=2) * np.exp(-t / 0.12) * 0.15
    return fade_out(pan2(mono) + wide, 0.05) / 1.4


NODE_SCALE = ["A4", "C5", "D5", "F5", "G5", "A5", "C6", "D6", "F6", "G6", "A6", "C7", "D7"]


def f_node_tick(ev):
    i = int(ev.get("index", 0))
    f = hz(NODE_SCALE[min(i, len(NODE_SCALE) - 1)])
    n = ns(0.3)
    t = tt(n)
    tone = (np.cos(2 * np.pi * f * t) * np.exp(-t / 0.07) + 0.25 * np.cos(4 * np.pi * f * t) * np.exp(-t / 0.03)
            + 0.1 * np.cos(6 * np.pi * f * t) * np.exp(-t / 0.015))
    ck = fnoise(n, 3000, 14000) * np.exp(-t / 0.0005) * 0.35
    out = fade_out(tone + ck, 0.02) * (1.0 - 0.025 * i)
    return pan2(out, -0.6 + 1.2 * i / 12.0)


def f_chime_name(ev):
    a = glass(hz("C6"), 1.8)
    b = glass(hz("G6"), 1.6, bright=0.7)
    out = a * 0.9
    out[:, :b.shape[1]] += 0.45 * b
    return out


def f_restore_swoosh(ev):
    dur = ev.get("dur", 0.75)
    arc = lambda u: 500.0 * (3800.0 / 500.0) ** np.sin(np.pi * u) * (1 - 0.3 * u)
    out = whoosh_body(dur, arc, 1.5, 0.35, 0.45, -0.7, 0.7) * 1.3
    n = out.shape[1]
    u = tt(n) / dur
    glide = np.sin(sweep_phase(hz("A4") * 2 ** np.sin(0.5 * np.pi * u))) * np.sin(np.pi * u) * 0.12
    return out + pan2(glide, 0.0)


def f_chime_arp(ev):
    notes = ["F5", "A5", "C6", "F6"]
    step = ns(0.045)
    g = [glass(hz(nm), 1.4, bright=0.8) for nm in notes]
    out = np.zeros((2, g[0].shape[1] + 3 * step))
    for j, (gl, p) in enumerate(zip(g, (-0.45, -0.15, 0.15, 0.45))):
        out[:, j * step:j * step + gl.shape[1]] += pan2(gl.mean(axis=0), p) * (0.75 + 0.08 * j)
    return out


def f_stream_tick(ev):
    r = np.random.default_rng(nseed())
    f = r.uniform(2200.0, 5500.0)
    n = ns(0.025)
    out = tick_tone(f, 0.0022, n, harm=0.15, click=0.5) * 10 ** (r.uniform(-3, 2) / 20)
    return pan2(out, r.uniform(-0.55, 0.55))


def f_manifesto_hit(ev):
    i = int(ev.get("index", 0))
    a = clap(4, 0.0095, 0.0035, 0.11, 0.75, 800.0, 2600.0, 0.45)
    b = clap(3, 0.0075, 0.0028, 0.06, 0.6, 1300.0, 4200.0, 0.6)
    s = snap()
    n = a.shape[1]
    t = tt(n)
    body = fnoise(n, 120, 500) * np.exp(-t / 0.025) * 0.45 + np.sin(2 * np.pi * 110.0 * t) * np.exp(-t / 0.05) * 0.35
    out = a.copy()
    out[:, :b.shape[1]] += 0.6 * b
    out[:, :len(s)] += pan2(s, 0.25) * 0.9
    out += pan2(body)
    if i == 8:  # the one inversion at 24.0
        out += fnoise(n, 3500, 14000, ch=2) * np.exp(-t / 0.3) * 0.3
    return out * (0.72 + 0.28 * i / 11.0)


def f_riser(ev):
    dur = ev.get("dur", 2.5)
    n = ns(dur)
    t = tt(n)
    u = t / dur
    fc = 250.0 * (11000.0 / 250.0) ** (u ** 1.2)
    nz = svf2(fnoise(n, ch=2), fc, 1.5 + 2.5 * u, "bp")
    # gated saw chord rising an octave; gate rate locked to the grid (8ths, 16ths, 32nds)
    tone = np.zeros((2, n))
    for name in ("F3", "C4", "F4", "A4"):
        f0 = hz(name)
        tab = saw_table(f0, 4000.0, fmax=8500.0)
        f = f0 * 2.0 ** (u ** 1.6)
        for ch, c in ((0, -8), (1, 8)):
            tone[ch] += wt_osc(tab, f * 2 ** (c / 1200.0), n, np.random.default_rng(nseed()).random())
    tone /= 4.0
    t_abs = float(ev["t"]) + t
    rate = np.where(t_abs < 24.0, 4.0, np.where(t_abs < 24.5, 8.0, 16.0))
    phi = np.concatenate([[0.0], np.cumsum(rate[:-1])]) / SR
    trem = 0.45 + 0.55 * (0.5 + 0.5 * np.cos(2 * np.pi * phi)) ** 2
    env = 10 ** ((-24.0 + 24.0 * u ** 1.3) / 20.0)
    out = (0.7 * nz + 0.6 * tone * trem) * env
    return fade_in(out, 0.01)


def f_snare_roll(ev):
    t0 = float(ev["t"])
    end = t0 + ev.get("dur", 1.0)
    half = t0 + (end - t0) / 2
    times = list(np.arange(t0, half - 1e-9, 0.125)) + list(np.arange(half, end - 1e-9, 0.0625))
    n_total = ns(end - t0 + 0.4)
    out = np.zeros((2, n_total))
    for j, tk in enumerate(times):
        v = 0.4 + 0.6 * (j / (len(times) - 1)) ** 1.2
        s = snare() * v
        i0 = ns(tk - t0)
        m = min(len(s), n_total - i0)
        out[:, i0:i0 + m] += pan2(s[:m], 0.12 if j % 2 else -0.12)
    return out


def f_massive_hit_parts():
    n = ns(3.0)
    t = tt(n)
    f = 30.0 + 30.0 * np.exp(-t / 0.45)
    sub = np.sin(sweep_phase(f) + 2 * np.pi * 60.0 / SR) * np.exp(-np.maximum(t - 0.05, 0) / 0.65)
    sub = np.tanh(2.0 * sub) / np.tanh(2.0)
    k = kick(f_hi=190.0, f_lo=55.0, p_tau=0.03, hold=0.02, a_tau=0.25, dur=0.8, click=0.7, drive=2.0)
    cl = clap(4, 0.0105, 0.004, 0.16, 0.8, 750.0, 2600.0, 0.6, dur=0.8)
    crash_nz = fnoise(n, 2800, 16000, ch=2)
    crash_m = np.zeros(n)
    r = np.random.default_rng(nseed())
    for fq in HAT_FREQS:
        crash_m += np.sign(np.sin(2 * np.pi * fq * 1.37 * t + r.uniform(0, 6.28)))
    crash_m = spec_filter(crash_m, lambda f_: band_mag(f_, 3000, 15000, 3))
    crash_m /= np.sqrt(np.mean(crash_m ** 2)) + 1e-12
    crash = crash_nz * np.exp(-t / 0.6) + pan2(crash_m * np.exp(-t / 0.4), 0.0) * 0.35
    boom = fnoise(n, 30, 220) * np.exp(-t / 0.25)
    body = np.zeros(n)
    body[:len(k)] += k
    mono = 1.0 * sub + 0.55 * body + 0.6 * boom
    return {"mono": fade_out(mono, 0.05), "clap": cl, "crash": fade_out(crash, 0.05)}


def f_final_chord(ev):
    dur = ev.get("dur", 3.0)
    notes = ["F2", "C3", "F3", "A3", "G4", "C5", "A5"]
    pad = pad_chord(notes, dur, attack=0.012, release=0.2, dark=900.0, bright=2600.0,
                    open_from=0.7, open_to=0.45, cents=((0, -9), (0, 4), (1, -4), (1, 9)))
    pad = haas(pad, 11.0, ch=1)
    n = pad.shape[1]
    t = tt(n)
    swell = 0.88 + 0.12 * np.exp(-t / 0.4)
    pad *= swell
    sh = np.zeros((2, n))
    for i, name in enumerate(["C6", "G6", "A6", "C7", "F7"]):
        f = hz(name)
        am = 0.55 + 0.45 * np.sin(2 * np.pi * (2.1 + 0.7 * i) * t + i)
        a = 0.35 / (1 + 0.4 * i) * np.minimum(1.0, t / 0.03)
        sh[0] += a * am * np.sin(2 * np.pi * f * (1 - 0.0006) * t)
        sh[1] += a * am * np.sin(2 * np.pi * f * (1 + 0.0006) * t + 0.7)
    low = np.sin(2 * np.pi * hz("F1") * t) * 0.06 * np.minimum(1.0, t / 0.01)
    return pad + 0.5 * sh + pan2(low)


def f_morph_shimmer(ev, size=1.0):
    dur = ev.get("dur", 0.5)
    n = ns(dur + 0.6)
    t = tt(n)
    u = np.clip(t / dur, 0, 1)
    r = np.random.default_rng(nseed())
    count = int(16 * size)
    out = np.zeros((2, n))
    base = hz("F1")
    ks = r.choice(np.arange(26, 98), size=count, replace=False)
    for j, k in enumerate(ks):
        start = 0.0 if j < 4 else r.uniform(0, 0.4 * dur)
        i0 = ns(start)
        m = n - i0
        tl = tt(m)
        f = base * k * (1 + 0.06 * np.clip(tl / dur, 0, 1))
        env = np.exp(-tl / r.uniform(0.1, 0.3))
        part = np.cos(sweep_phase(f)) * env * (0.5 + 0.5 * r.random())
        out[:, i0:] += pan2(part, r.uniform(-0.8, 0.8))
    out /= np.sqrt(count)
    fc = 3000.0 * 3.0 ** u
    sw = svf2(fnoise(n, ch=2), fc, 1.8, "bp") * np.sin(np.pi * u) ** 0.7 * 0.5
    sw[:, ns(dur):] = 0.0
    puff = fnoise(n, 4000, 14000, ch=2) * np.exp(-t / 0.004) * 0.4
    return fade_out((out + sw + puff) * size ** 0.3, 0.05)


# ============================================================ event router
# cue kind -> (renderer, gain, pan, room send, hall send, bus); cues at or after HIT_T go to the post bus
CUE_SOUNDS = {
    "tink":             (f_tink,            0.13,  0.15, 0.0, 0.55, "foley"),
    "reverse_whoosh":   (f_reverse_whoosh,  0.2,  0.0,  0.0, 0.25, "foley"),
    "word_tick":        (f_word_tick,       0.12, 0.0,  0.1, 0.10, "foley"),
    "short_riser":      (f_short_riser,     0.32,  0.0,  0.0, 0.20, "foley"),
    "scan_zip":         (f_scan_zip,        0.52,  0.0,  0.1, 0.15, "foley"),
    "blok_clack":       (f_blok_clack,      0.95,  None, 0.25, 0.0, "foley"),
    "label_snap":       (f_label_snap,      0.62,  0.0,  0.3, 0.05, "foley"),
    "whoosh":           (f_whoosh,          0.36,  0.0,  0.0, 0.2,  "foley"),
    "compile_tick":     (f_compile_tick,    0.6,  0.0,  0.15, 0.05, "foley"),
    "flip":             (f_flip,            0.85,  0.0,  0.2, 0.05, "foley"),
    "cursor_glide":     (f_cursor_glide,    0.04, 0.0,  0.0, 0.0,  "foley"),
    "click":            (f_click,           1.1,  0.0,  0.2, 0.0,  "foley"),
    "chime2":           (f_chime2,          0.32,  0.0,  0.0, 0.45, "foley"),
    "whoosh_in":        (f_whoosh_in,       0.26,  0.0,  0.0, 0.15, "foley"),
    "impact":           (f_impact,          1.05,  0.0,  0.3, 0.25, "foley"),
    "node_tick":        (f_node_tick,       0.2,  0.0,  0.1, 0.25, "foley"),
    "chime_name":       (f_chime_name,      0.32,  0.0,  0.0, 0.5,  "foley"),
    "restore_swoosh":   (f_restore_swoosh,  0.36,  0.0,  0.0, 0.3,  "foley"),
    "chime_arp":        (f_chime_arp,       0.38,  0.0,  0.0, 0.5,  "foley"),
    "stream_tick":      (f_stream_tick,     0.065, 0.0,  0.1, 0.05, "foley"),
    "morph_shimmer":    (f_morph_shimmer,   0.55,  0.0,  0.0, 0.6,  "foley"),
    "morph_shimmer_small": (lambda ev: f_morph_shimmer(ev, 0.6), 0.48, 0.0, 0.0, 0.6, "foley"),
    "sub_swell":        (f_sub_swell,       0.3,  0.0,  0.0, 0.0,  "music"),
    "air_pad":          (f_air_pad,         0.09,  0.0,  0.0, 0.3,  "music"),
    "kick_heartbeat":   (f_kick_heartbeat,  0.55,  0.0,  0.0, 0.0,  "music"),
    "riser":            (f_riser,           0.7,  0.0,  0.0, 0.15, "music"),
    "snare_roll":       (f_snare_roll,      0.8,  0.0,  0.3, 0.1,  "music"),
    "manifesto_hit":    (f_manifesto_hit,   0.62,  0.0,  0.3, 0.15, "music"),
}
BLOK_PANS = (-0.45, -0.15, 0.15, 0.45)

# major foley moments pull the music down a little so they read on top
FOLEY_DUCK = {"blok_clack": 0.45, "click": 0.5, "impact": 0.45, "chime2": 0.3, "chime_name": 0.3,
              "chime_arp": 0.3, "compile_tick": 0.25, "node_tick": 0.15, "label_snap": 0.15,
              "flip": 0.35, "scan_zip": 0.2, "whoosh": 0.15, "whoosh_in": 0.25, "restore_swoosh": 0.2}


def duck_curve(hits, att=0.004, hold=0.03, rel=0.2, pre=False):
    """Gain curve dipping by `depth` at each (time, depth[, hold]) with a short attack and smooth release.
    pre=True starts the attack `att` early so the dip is already full on the cue frame (only ever
    lowers the music, so it adds nothing ahead of the cue)."""
    g = np.ones(N)
    for h in hits:
        tk, depth = h[0], h[1]
        hd = h[2] if len(h) > 2 else hold
        i0 = ns(tk - att) if pre else ns(tk)
        n = min(ns(att + hd + rel), N - i0)
        if n <= 0:
            continue
        t = tt(n)
        e = np.clip(t / att, 0, 1) * (1 - smoothstep((t - att - hd) / rel))
        g[i0:i0 + n] = np.minimum(g[i0:i0 + n], 1 - depth * e)
    return g


# ================================================================== the bed
# groove balance (linear gains into the music bus); tuned by K-weighted loudness per layer
G_KICK = 0.80
G_CLAP = 0.70
G_SNAP = 0.72
G_HAT_C = 0.30
G_HAT_O = 0.26
G_HAT_GHOST = 0.12
G_BASS = 0.36
G_PLUCK = 0.50
G_PAD = 0.17


def chord_at(t):
    if t < 4.0:
        return "Dm9"
    return PROG[int((t - 4.0) // BAR) % len(PROG)]


def build_music(music, kicks):
    """Groove from 4.0 to the cut: kick, clap+snap, hats, sub bass, plucks, pad."""
    rng = np.random.default_rng(77)
    claps = cached("clap", lambda: clap(), 6)
    snaps = cached("snap", snap, 6)
    hats_c = cached("hat_c", lambda: hat(0.02, 0.12), 8)
    hats_o = cached("hat_o", lambda: hat(0.16, 0.5, 0.6), 4)
    k_main = kick()

    def on(t):
        return t < CUT_T - 1e-9

    # kick: beats 1 and 3, a ghost on the and-of-4 every other bar, four on the floor from 22.0
    for i in range(int((22.0 - 4.0) / 1.0)):
        kicks.append((4.0 + i * 1.0, 1.0))
    for b in (6.0, 10.0, 14.0, 18.0):
        kicks.append((b + 1.75, 0.5))
    t = 22.0
    while on(t):
        kicks.append((t, 1.08))
        t += BEAT
    for tk, v in kicks:
        if tk >= 4.0:
            music.add(tk, k_main * v, G_KICK)  # mono, dry

    # clap + snap on 2 and 4 (manifesto hits take over at 22.0); a snap pickup into the manifesto
    j = 0
    for i in range(int((22.0 - 4.5) / 1.0) + 1):
        tc = 4.5 + i * 1.0
        if tc >= 22.0:
            break
        music.add(tc, claps[j % 6], G_CLAP, 0.0, room=0.32, hall=0.08)
        music.add(tc, snaps[j % 6], G_SNAP, 0.3, room=0.2)
        j += 1
    music.add(21.75, snaps[1], G_SNAP * 0.7, -0.3, room=0.25)
    music.add(21.875, snaps[2], G_SNAP * 0.85, 0.3, room=0.25)

    # hats: closed 8ths, open on the offbeats from 8.0 (choked), 16th ghosts 16-22, 16ths in the manifesto
    t = 4.0
    k = 0
    while on(t):
        off = (k % 2) == 1
        if off and t >= 8.0:
            h = hats_o[k % 4].copy()
            m = min(len(h), ns(0.25))
            h = h[:m].copy()
            fade_out(h, 0.012)
            music.add(t, h, G_HAT_O, 0.35, room=0.05)
        else:
            music.add(t, hats_c[k % 8], G_HAT_C * (1.0 if off else 0.62), 0.3, room=0.04)
        if 16.0 <= t < 22.0 or 22.0 <= t < 24.5:
            music.add(t + 0.125, hats_c[(k + 3) % 8], G_HAT_GHOST * (1.0 if t < 22.0 else 1.5), -0.25)
        t += 0.25
        k += 1

    # sub bass on 8ths, busier from 8.0, octave pops from 16.0
    bass = np.zeros((2, N))
    for bs in np.arange(4.0, CUT_T, BAR):
        ch = chord_at(bs)
        root, fifth = hz(BASS_ROOT[ch]), hz(BASS_FIFTH[ch])
        for e in range(8):
            tn = bs + e * 0.25
            if not on(tn):
                break
            f, gate, vel = root, 0.17, (0.8 if e % 2 else 0.72)
            if 16.0 <= bs < 22.0:
                if e in (3, 7):
                    f, gate, vel = root * 2, 0.1, 0.62
                elif e == 5:
                    f = fifth
            elif bs >= 22.0 and e in (3, 7):
                f, gate, vel = root * 2, 0.1, 0.66
            if 8.0 <= bs < 16.0 and e == 7:
                gate = 0.11
            nb = bass_note(f, gate, vel)
            i0 = ns(tn)
            m = min(len(nb), N - i0)
            bass[:, i0:i0 + m] += nb[:m]
        if 8.0 <= bs < 16.0 and on(bs + 1.875):
            nb = bass_note(root, 0.08, 0.55)
            i0 = ns(bs + 1.875)
            bass[:, i0:i0 + len(nb)] += nb

    # pluck stabs on offbeats (two-bar call and answer), dotted-8th ping-pong
    pl = np.zeros((2, N))
    for bi, bs in enumerate(np.arange(4.0, CUT_T, BAR)):
        ch = chord_at(bs)
        offs = (0.25, 0.75, 1.25) if bi % 2 == 0 else (0.25, 1.25, 1.75)
        if bs >= 22.0:
            offs = (0.25, 0.75, 1.25, 1.75)
        for j2, o in enumerate(offs):
            tn = bs + o
            if not on(tn):
                continue
            p = pluck_chord(PLUCK_VOICING[ch], (0.9, 0.7, 0.8, 0.75)[j2] * (0.9 + 0.2 * rng.random()))
            i0 = ns(tn)
            m = min(p.shape[1], N - i0)
            pl[:, i0:i0 + m] += p[:, :m]

    # pad: soft Dm9 from the pad_chord cue at 2.0, then one chord per bar
    pad_ev = [e for e in CUES["events"] if e["kind"] == "pad_chord"][0]
    segs = [(float(pad_ev["t"]), pad_ev["chord"])]
    for bs in np.arange(4.0, CUT_T, BAR):
        segs.append((bs, chord_at(bs)))
    merged = []
    for s0, c in segs:
        if merged and merged[-1][1] == c:
            continue
        merged.append((s0, c))
    pad = np.zeros((2, N))
    for i, (s0, c) in enumerate(merged):
        s1 = merged[i + 1][0] if i + 1 < len(merged) else CUT_T
        att = 0.06 if i == 0 else 0.03
        p = haas(pad_chord(PAD_VOICING[c], s1 - s0, attack=att), 11.0, ch=1)
        i0 = ns(s0)
        m = min(p.shape[1], N - i0)
        pad[:, i0:i0 + m] += p[:, :m]
    tN = tt(N)
    pad *= 0.75 + 0.25 * smoothstep((tN - 3.8) / 0.4)

    return bass, pl, pad


# ================================================================ mastering
KW = [([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]),
      ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])]


def lufs(x):
    """ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks, gated)."""
    y = iir_fft(x, KW)
    blk, hop = ns(0.4), ns(0.1)
    p = np.concatenate([[0.0], np.cumsum(np.sum(y ** 2, axis=0))])
    starts = np.arange(0, y.shape[1] - blk + 1, hop)
    z = (p[starts + blk] - p[starts]) / blk
    lk = -0.691 + 10 * np.log10(z + 1e-30)
    za = z[lk > -70.0]
    rel = -0.691 + 10 * np.log10(za.mean()) - 10.0
    zr = z[(lk > -70.0) & (lk > rel)]
    return -0.691 + 10 * np.log10(zr.mean())


def tp_env(x):
    """Per-sample true-peak estimate from 4x band-limited oversampling, linked across channels."""
    n = x.shape[1]
    up = np.fft.irfft(np.fft.rfft(x, axis=1), 4 * n, axis=1) * 4.0
    return np.abs(up).max(axis=0).reshape(n, 4).max(axis=1)


def sliding_min(x, w):
    m, p = x, 1
    while 2 * p <= w:
        m = np.minimum(m[:-p], m[p:])
        p *= 2
    cnt = len(x) - w + 1
    return np.minimum(m[:cnt], m[w - p:w - p + cnt])


def limiter(x, pk, ceiling_db, look_ms=1.5, hold_ms=15.0, release_ms=90.0):
    """Lookahead brickwall: gain reaches its target before the peak arrives,
    holds, then releases exponentially. The signal itself is not delayed."""
    c = 10 ** (ceiling_db / 20.0)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    L, H = ns(look_ms / 1000.0), ns(hold_ms / 1000.0)
    win = sliding_min(np.concatenate([np.ones(H), need, np.ones(L)]), H + L + 1)
    a = float(np.exp(-1.0 / (release_ms / 1000.0 * SR)))
    out = [0.0] * len(win)
    cur = 1.0
    for i, v in enumerate(win.tolist()):
        cur = v if v < cur else v + (cur - v) * a
        out[i] = cur
    g = np.array(out)
    ext = np.concatenate([[0.0], np.cumsum(np.concatenate([np.ones(L), g]))])
    gs = (ext[L + 1:L + 1 + len(g)] - ext[:len(g)]) / (L + 1)
    return x * gs, gs


def masks():
    m = np.ones(N)
    i_cut, i_hit = ns(CUT_T), ns(HIT_T)
    k = ns(0.005)
    m[i_cut - k:i_cut + 1] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, k + 1)))
    m[i_cut:i_hit] = 0.0
    i_f = ns(FADE_T)
    x = np.linspace(0.0, 1.0, N - i_f)
    m[i_f:] = 0.5 * (1 + np.cos(np.pi * x))
    return m


# ===================================================================== main
def render():
    music, foley, post = Bus("music"), Bus("foley"), Bus("post")
    kicks = []
    foley_hits = []
    placed = {}  # (kind, t) -> (start frame, first nonzero frame of the rendered sound), for the onset report

    def note_onset(kind, t, sig):
        a = np.abs(st(sig)).max(axis=0)
        placed[(kind, round(t, 6))] = (ns(t), int(np.argmax(a > 1e-9)))

    seen = {}
    for ev in sorted(CUES["events"], key=lambda e: float(e["t"])):
        kind = ev["kind"]
        t = float(ev["t"])
        ev = dict(ev, _n=seen.get(kind, 0))  # occurrence number for cues without an index
        seen[kind] = ev["_n"] + 1
        if kind in ("silence", "pad_chord"):
            continue
        if kind == "massive_hit":
            parts = f_massive_hit_parts()
            post.add(t, parts["mono"], 0.95, 0.0, room=0.1, hall=0.25)
            post.add(t, parts["clap"], 0.7, 0.0, room=0.4, hall=1.1)
            post.add(t, parts["crash"], 0.22, 0.0, hall=0.4)
            note_onset(kind, t, parts["mono"])
            continue
        if kind == "final_chord":
            post.add(t, f_final_chord(ev), 0.55, 0.0, hall=0.5)
            continue
        if kind not in CUE_SOUNDS:
            raise SystemExit(f"no renderer for cue kind {kind!r}")
        fn, gain, pan, room, hall, busname = CUE_SOUNDS[kind]
        sig = fn(ev)
        if kind == "blok_clack":
            pan = BLOK_PANS[int(ev.get("index", 0)) % 4]
        bus = post if t >= HIT_T - 1e-9 else (music if busname == "music" else foley)
        bus.add(t, sig, gain, pan or 0.0, room, hall)
        if kind == "kick_heartbeat":
            kicks.append((t, 1.0))
        note_onset(kind, t, sig)
        if kind in FOLEY_DUCK:
            foley_hits.append((t, FOLEY_DUCK[kind], max(0.03, ev.get("dur", 0.03) * 0.6)))

    bass, plucks, pad = build_music(music, kicks)

    # sidechain: pad, bass and plucks breathe with the kick
    groove_k = [(tk, v) for tk, v in kicks if tk >= 4.0]
    heart_k = [(tk, v) for tk, v in kicks if tk < 4.0]
    sc_bass = duck_curve([(tk, 0.88 * min(v, 1.0)) for tk, v in groove_k], att=0.002, hold=0.03, rel=0.13)
    sc_pad = duck_curve([(tk, 0.55 * min(v, 1.0)) for tk, v in groove_k] + [(tk, 0.3) for tk, _ in heart_k],
                        att=0.004, hold=0.02, rel=0.22)
    sc_pl = duck_curve([(tk, 0.4 * min(v, 1.0)) for tk, v in groove_k], att=0.004, hold=0.02, rel=0.18)
    music.add_array(bass * sc_bass, G_BASS)
    pl = plucks * sc_pl
    music.add_array(pl, G_PLUCK, hall=0.25)
    music.add_array(pingpong(pl), G_PLUCK * 0.55)
    music.add_array(pad * sc_pad, G_PAD, hall=0.35)

    music_out = music.render()

    # the dive: music closes as the camera dives (13.7-14.0), then a 24 dB/oct
    # low-pass opens from 400 Hz to full by 16.0
    a, b = ns(13.6), ns(16.2)
    tseg = tt(b - a) + 13.6
    full = 21000.0
    fc = np.full(b - a, full)
    m1 = (tseg >= 13.7) & (tseg < 14.0)
    fc[m1] = full * (400.0 / full) ** ((tseg[m1] - 13.7) / 0.3)
    m2 = (tseg >= 14.0) & (tseg < 16.0)
    fc[m2] = 400.0 * (full / 400.0) ** (((tseg[m2] - 14.0) / 2.0) ** 1.5)
    seg = music_out[:, a:b]
    filt = np.stack([svf(svf(seg[c], fc, 0.9, "lp"), fc, 0.6, "lp") for c in range(2)])
    xf = ns(0.012)
    w = np.ones(b - a)
    w[:xf] = np.linspace(0, 1, xf)
    w[-xf:] = np.linspace(1, 0, xf)
    music_out[:, a:b] = seg * (1 - w) + filt * w

    music_out *= duck_curve(foley_hits, att=0.003, hold=0.04, rel=0.2, pre=True)
    foley_out = foley.render()

    pre = iir_fft(music_out + foley_out, MASTER_EQ)
    post_out = iir_fft(post.render(), MASTER_EQ)
    post_out[:, :ns(HIT_T)] = 0.0
    m = masks()
    pre *= m
    pre[:, ns(CUT_T):] = 0.0
    mix = pre + post_out

    # bus: gentle tanh glue at a fixed loudness, then limiter matched to the target
    x = mix * 10 ** ((-19.0 - lufs(mix)) / 20.0)
    x = np.tanh(1.15 * x) / 1.15
    pk = tp_env(x)
    gain_db = 5.0
    for _ in range(6):
        y, gr = limiter(x * 10 ** (gain_db / 20.0), pk * 10 ** (gain_db / 20.0), CEILING_DBTP)
        L = lufs(y)
        if abs(L - TARGET_LUFS) < 0.03:
            break
        gain_db += TARGET_LUFS - L
    y *= m
    y[:, ns(CUT_T):ns(HIT_T)] = 0.0
    y[:, -1] = 0.0
    stems = {"music": music_out, "foley": foley_out, "post": post_out, "placed": placed, "gr": gr}
    return y, stems


def write_wav(y, path):
    pcm = np.clip(np.round(y * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.T.reshape(-1).tobytes())


def read_wav(path):
    with wave.open(path, "rb") as wf:
        info = (wf.getnchannels(), wf.getsampwidth(), wf.getframerate(), wf.getnframes())
        raw = wf.readframes(wf.getnframes())
    data = np.frombuffer(raw, dtype="<i2").reshape(-1, info[0]).T.astype(float) / 32768.0
    return info, data


# ============================================================ verification
def onset(x, t, pre_ms=30.0, search_ms=10.0):
    """First sample whose high-passed magnitude clears the local background:
    threshold = max(2 x the pre-window maximum, 25 % of the hit's own peak)."""
    d = np.abs(np.diff(x, axis=1)).max(axis=0)  # d[k] = |x[k+1]-x[k]|
    i = ns(t)
    bg = d[max(0, i - ns(pre_ms / 1000)) - 1:i - ns(0.002) - 1].max(initial=0.0)
    pk = d[i - 1:i + ns(search_ms / 1000)].max()
    thr = max(2.0 * bg, 0.25 * pk, 1e-6)
    lo = i - ns(search_ms / 1000) - 1
    hits = np.nonzero(d[lo:i + ns(search_ms / 1000)] > thr)[0]
    if len(hits) == 0:
        return None, bg, pk
    return (lo + hits[0] + 1 - i) / SR * 1000.0, bg, pk


def verify(stems):
    info, x = read_wav(OUT_PATH)
    ch, sw, sr, nf = info
    print("\n== format")
    print(f"channels={ch} sample_width={sw * 8}bit rate={sr} frames={nf} duration={nf / sr:.6f}s "
          f"({'OK' if nf == 1440000 and sr == 48000 else 'WRONG'})")

    i_cut, i_hit = ns(CUT_T), ns(HIT_T)
    zone = x[:, i_cut:i_hit]
    nzc = int(np.count_nonzero(zone))
    print("\n== dropoff")
    print(f"samples {i_cut}..{i_hit - 1} ({CUT_T:.3f}-{HIT_T:.3f}s, both channels): nonzero={nzc} "
          f"-> {'all exact zeros' if nzc == 0 else 'NOT SILENT'}")
    last_pre = np.nonzero(np.abs(x[:, :i_cut]).max(axis=0) > 0)[0][-1]
    first_post = i_hit + np.nonzero(np.abs(x[:, i_hit:]).max(axis=0) > 0)[0][0]
    print(f"last nonzero frame before the drop: {last_pre} ({last_pre / SR:.5f}s); "
          f"first nonzero frame after: {first_post} ({first_post / SR:.5f}s); "
          f"last frame value: {x[:, -1].tolist()}")

    print("\n== onsets (mix: first sample clearing the local background in the written file; "
          "rendered: first nonzero sample of the event as placed)")
    rows = []
    for ev in CUES["events"]:
        if ev["kind"] not in ("blok_clack", "click", "impact", "massive_hit", "manifesto_hit"):
            continue
        off, bg, pk = onset(x, ev["t"])
        i0, k0 = stems["placed"][(ev["kind"], round(float(ev["t"]), 6))]
        iso = (i0 + k0 - ev["t"] * SR) / SR * 1000.0
        rows.append((ev["kind"], ev.get("index", ""), ev["t"], off, iso, bg, pk))
    worst = 0.0
    for kind, ix, t, off, iso, bg, pk in rows:
        ok = off is not None and abs(off) <= 3.0
        worst = max(worst, abs(off) if off is not None else 99)
        offs = "   none" if off is None else f"{off:+7.3f}"
        print(f"  {kind:14s} {str(ix):>3s} t={t:7.3f}s  mix {offs} ms  rendered {iso:+7.3f} ms  "
              f"(bg {bg:.4f} / hit {pk:.4f}) {'ok' if ok else 'FAIL'}")
    print(f"  worst |offset| in mix: {worst:.3f} ms over {len(rows)} events")

    print("\n== loudness (own BS.1770 meter)")
    L = lufs(x)
    tp = 20 * np.log10(tp_env(x).max())
    print(f"integrated {L:.2f} LUFS, true peak {tp:.2f} dBTP (4x), sample peak {20 * np.log10(np.abs(x).max()):.2f} dBFS")
    gr = stems["gr"]
    print(f"limiter gain reduction: max {-20 * np.log10(gr.min()):.2f} dB, "
          f"time with >1 dB GR: {np.mean(gr < 10 ** (-1 / 20)) * 100:.1f}%")
    for a, b, name in ((4, 14, "groove 4-14"), (14, 16, "dive 14-16"), (16, 22, "groove 16-22"),
                       (22, 25.5, "manifesto"), (27, 28, "hit 27-28"), (28, 30, "chord 28-30")):
        seg = gr[ns(a):ns(b)]
        print(f"   {name:13s} max GR {-20 * np.log10(seg.min()):5.2f} dB")

    ff = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if os.path.exists(ff):
        print("\n== loudness (ffmpeg ebur128, peak=true)")
        res = subprocess.run([ff, "-nostats", "-hide_banner", "-i", OUT_PATH, "-af", "ebur128=peak=true",
                              "-f", "null", "-"], capture_output=True, text=True)
        tail = res.stderr[res.stderr.rfind("Summary:"):]
        keep = [l for l in tail.splitlines() if l.strip() and not l.lstrip().startswith(("[", "size="))]
        print("  " + "\n  ".join(keep))

    print("\n== energy per 0.5 s: RMS dBFS (both channels, bar = RMS) and momentary LUFS (400 ms inside the slot)")
    kx = iir_fft(x, KW)
    lines = []
    for k in range(60):
        seg = x[:, ns(k * 0.5):ns((k + 1) * 0.5)]
        r = np.sqrt(np.mean(seg ** 2))
        db = 20 * np.log10(r) if r > 0 else -np.inf
        ks = kx[:, ns(k * 0.5 + 0.05):ns(k * 0.5 + 0.45)]
        zm = np.sum(np.mean(ks ** 2, axis=1))
        lm = "   -inf" if r == 0 else f"{-0.691 + 10 * np.log10(zm + 1e-30):7.1f}"
        bar = "" if not np.isfinite(db) else "#" * max(0, int(round((db + 60) / 2)))
        dbs = "  -inf" if not np.isfinite(db) else f"{db:6.1f}"
        lines.append(f"{k * 0.5:5.1f}s {dbs} {lm} {bar:<26s}")
    for k in range(30):
        print(lines[k] + "   " + lines[k + 30])


def main():
    y, stems = render()
    write_wav(y, OUT_PATH)
    print(f"wrote {OUT_PATH}")
    if "--verify" in sys.argv:
        verify(stems)


if __name__ == "__main__":
    main()
