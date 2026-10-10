/* Deterministic timeline helpers. Every frame is a pure function of t (seconds). */
(function () {
  var clamp = function (x, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.min(b, Math.max(a, x)); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var P = function (t, a, b) { return clamp((t - a) / (b - a)); };

  /* cubic-bezier(x1, y1, x2, y2) as an easing function */
  function bez(x1, y1, x2, y2) {
    function X(s) { return ((1 - 3 * x2 + 3 * x1) * s + (3 * x2 - 6 * x1)) * s * s + 3 * x1 * s; }
    function Y(s) { return ((1 - 3 * y2 + 3 * y1) * s + (3 * y2 - 6 * y1)) * s * s + 3 * y1 * s; }
    function dX(s) { return 3 * (1 - 3 * x2 + 3 * x1) * s * s + 2 * (3 * x2 - 6 * x1) * s + 3 * x1; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var s = x, i;
      for (i = 0; i < 8; i++) { var d = dX(s); if (Math.abs(d) < 1e-6) break; s -= (X(s) - x) / d; }
      if (s < 0 || s > 1 || Math.abs(X(s) - x) > 1e-4) { var lo = 0, hi = 1; s = x; for (i = 0; i < 40; i++) { if (X(s) < x) lo = s; else hi = s; s = (lo + hi) / 2; } }
      return Y(s);
    };
  }
  var E = {
    out: bez(.16, 1, .3, 1),          // aggressive burst, long glide
    brand: bez(.32, .72, 0, 1),       // from the live logo
    draw: bez(.6, 0, .2, 1),          // lines being drawn
    in: bez(.7, 0, .84, 0),           // accelerating dive
    io: function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
    back: function (k) { var c = 1.6; k = k - 1; return 1 + (c + 1) * k * k * k + c * k * k; },
    lin: function (k) { return k; }
  };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function show(el, on) { el.classList.toggle("hide", !on); return on; }

  /* Split an element's text into word spans once. Non-breaking spaces keep groups together. */
  function words(el) {
    if (el._w) return el._w;
    var parts = el.textContent.split(" ");
    el.innerHTML = parts.map(function (p) { return '<span class="w">' + p + "</span>"; }).join(" ");
    el._w = Array.prototype.slice.call(el.querySelectorAll(".w"));
    return el._w;
  }

  /* Per-word blur stagger: heavy blur and low opacity resolving into focus.
     times: start time of each word (array) or a first time plus stagger. */
  function blurIn(el, t, times, o) {
    o = o || {};
    var ws = words(el), dur = o.dur || .55, blur = o.blur == null ? 18 : o.blur, rise = o.rise == null ? 26 : o.rise;
    ws.forEach(function (w, i) {
      var s = Array.isArray(times) ? times[Math.min(i, times.length - 1)] : times + i * (o.stagger || .07);
      var k = E.out(P(t, s, s + dur));
      var ko = clamp(P(t, s, s + dur * .5));
      w.style.opacity = ko;
      w.style.filter = k >= 1 ? "none" : "blur(" + ((1 - k) * blur).toFixed(2) + "px)";
      w.style.transform = "translateY(" + ((1 - k) * rise).toFixed(2) + "px)";
    });
  }
  /* Whole-line exit: blur up and fade. */
  function blurOut(el, t, t0, dur, o) {
    o = o || {};
    var k = E.io(P(t, t0, t0 + (dur || .3)));
    el.style.opacity = 1 - k;
    el.style.filter = k > 0 ? "blur(" + (k * (o.blur || 20)).toFixed(2) + "px)" : "none";
    el.style.transform = (o.base || "") + " scale(" + (1 + k * (o.grow || .04)) + ")";
  }

  window.F = { clamp: clamp, lerp: lerp, P: P, E: E, bez: bez, $: $, $$: $$, show: show, words: words, blurIn: blurIn, blurOut: blurOut };
})();
