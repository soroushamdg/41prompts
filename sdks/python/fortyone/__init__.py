# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""``fortyone`` — resolve a published prompt at runtime.

.. code-block:: python

    import fortyone

    result = fortyone.resolve("pr_1a2b3c4d", {"customer_name": "Ada"})
    if result.status == "ok":
        answer = model.complete(result.text)

**Three rules, and they are the whole design** (``CLAUDE.md`` rule 8):

1. ``resolve()`` never waits for the network. It answers from memory, disk, or what the deploy
   bundled; the network is a background refresh that fills the first two.
2. It never raises. Everything that would have been an exception is an :class:`SdkWarning`.
3. Telemetry is off. When it is turned on it adds one header to a request that was happening
   anyway and never sends one of its own.

**What that costs, stated here because it is the one surprise in the API**: the first ``resolve()``
in a fresh process with no disk cache and nothing bundled returns ``status="unavailable"`` and an
empty string. ``bundled=`` is the answer for a deploy that must be right from its first request, and
:meth:`Client.refresh` is the answer for an application that would rather wait once at start-up,
where waiting is allowed.

This is the Python half of ADR-006's frozen surface. ``README.md`` carries the divergence table the
roadmap's Review line asks for — every place a name or a behaviour differs from ``@41prompts/sdk``,
with the reason.
"""

from __future__ import annotations

import logging
import os
import random
import sys
import threading
import time
from typing import Any, Callable, Mapping, Sequence

from ._bind import bind_variables
from ._canonical import js_number
from ._disk import Entry, default_cache_dir, install_id, read_from_disk, write_to_disk
from ._network import DEFAULT_RETRY_AFTER_SECONDS, Http, NetworkConfig, fetch_live, urllib_http
from ._types import ResolveResult, ResolveSource, SdkWarning, WarningCode, WarningHandler
from ._verify import check_build

__all__ = [
    "Client",
    "ResolveResult",
    "ResolveSource",
    "SdkWarning",
    "WarningCode",
    "WarningHandler",
    "configure",
    "create_client",
    "resolve",
]

# This package's own version, written out rather than read from the installed metadata, because an
# uninstalled source checkout has no metadata and the telemetry header must not depend on how the
# package was obtained. `tests/test_packaging.py` pins it to `pyproject.toml` so the copy cannot go
# stale — the same trade `packages/sdk-ts/src/version.ts` makes for the same reason.
__version__ = "0.1.0"

DEFAULT_BASE_URL = "https://app.41prompts.ai"
DEFAULT_REFRESH_SECONDS = 30.0
DEFAULT_JITTER = 0.25
DEFAULT_TIMEOUT_SECONDS = 5.0

_LOG = logging.getLogger("fortyone")


class _Unset:
    """The absent-option sentinel.

    TypeScript tells an option that was not passed from one passed as ``null`` by having two empty
    values. Python has one, and ``cache_dir=None`` has to mean *turn the cache off* — so "not
    passed" needs a value of its own. The same shape as ``dataclasses.MISSING``.
    """

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "<unset>"


UNSET = _Unset()


def _default_warner() -> WarningHandler:
    """The default handler: one log record per code, naming the option that replaces it.

    Silence was the alternative and it is worse. A key that is refused, a prompt that is not
    published or a cache directory that cannot be written are each invisible to a caller who did not
    think to pass a handler — and the symptom, an empty prompt, points nowhere near the cause. Once
    per code is what keeps that from becoming a line a minute for the life of the process.

    **A logger rather than a write to stderr.** ``@41prompts/sdk`` calls ``console.warn`` because
    that is what a Node application reads; a Python application configures logging centrally, and a
    package that writes to stderr directly cannot be routed or quieted without monkeypatching. With
    no handler configured, ``logging.lastResort`` still puts it on stderr, so the default is visible
    either way.
    """
    seen: set[str] = set()
    lock = threading.Lock()

    def warn(warning: SdkWarning) -> None:
        with lock:
            if warning.code in seen:
                return
            seen.add(warning.code)
        where = "" if warning.prompt_id is None else f" ({warning.prompt_id})"
        _LOG.warning(
            "%s%s — pass on_warning to handle this yourself; further %r warnings are not repeated",
            warning.message,
            where,
            warning.code,
        )

    return warn


def _guard(handler: WarningHandler | None) -> WarningHandler:
    """A handler a caller wrote can raise. That must not become this package raising."""
    if handler is None:
        return lambda warning: None

    def guarded(warning: SdkWarning) -> None:
        try:
            handler(warning)
        except Exception:  # noqa: BLE001 - a warning about a failing warning handler is the same call
            pass

    return guarded


def _positive(value: Any, fallback: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    number = float(value)
    return number if number > 0 and number == number and number != float("inf") else fallback


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _from_env(name: str) -> str | None:
    try:
        return _text(os.environ.get(name))
    except Exception:  # noqa: BLE001 - a hostile os.environ is still not this package's to raise on
        return None


def _unresolved(prompt_id: str, missing: tuple[str, ...] = ()) -> ResolveResult:
    """The answer when nothing could be resolved. Every field present; ``status`` says the rest."""
    return ResolveResult(
        status="unavailable",
        text="",
        source="none",
        prompt_id=prompt_id,
        version=None,
        build_hash=None,
        model=None,
        missing=missing,
        used_defaults=(),
    )


def _to_values(variables: Any, warn: WarningHandler) -> dict[str, str]:
    """The caller's values as a map of strings.

    Reading them is wrapped because a caller is not always a type-checked caller: ``variables`` can
    be a mapping whose ``__getitem__`` raises, or something that is not a mapping at all. A value
    that is not a scalar is dropped with a warning rather than stringified — ``<object object at
    0x…>`` inside somebody's prompt is worse than an honest refusal.

    **Numbers and booleans are rendered as JavaScript renders them**, not as Python's ``str``
    does: ``True`` becomes ``"true"`` and ``1.0`` becomes ``"1"``. The same binding has to produce
    the same prompt in both SDKs, because the prompt is what a model reads — and ``"True"`` in one
    language and ``"true"`` in the other is two different prompts from one set of values.
    """
    values: dict[str, str] = {}
    if variables is None:
        return values
    if not isinstance(variables, Mapping):
        return values

    try:
        keys = list(variables.keys())
    except Exception:  # noqa: BLE001
        return values

    for key in keys:
        if not isinstance(key, str):
            continue
        try:
            value = variables[key]
        except Exception:  # noqa: BLE001
            warn(SdkWarning("missing_variables", f"reading the value for {key} raised; it was skipped"))
            continue
        if isinstance(value, str):
            values[key] = value
        elif isinstance(value, bool):
            values[key] = "true" if value else "false"
        elif isinstance(value, int):
            values[key] = str(value)
        elif isinstance(value, float):
            try:
                values[key] = js_number(value)
            except ValueError:
                warn(SdkWarning("missing_variables", f"the value for {key} is not a finite number; it was skipped"))
        elif value is not None:
            warn(SdkWarning("missing_variables", f"the value for {key} is not a string; it was skipped"))
    return values


def _index_bundled(documents: Any, warn: WarningHandler) -> dict[str, Entry]:
    """Index the caller's ``bundled`` sequence by prompt id.

    The third source in ``CLAUDE.md`` rule 8's order, and the one that makes *"stop the service; the
    app still answers"* true on a machine that has never had a cache. ``41p pull`` writes these
    documents into ``41p/builds/``.

    **A bad entry is dropped, not refused.** One malformed document must not take out the ones next
    to it: the deploy that carries it is already out, and refusing the whole sequence would turn a
    stale prompt into no prompt, which is the opposite of what this source is for.

    Each document is checked against its own content address — check 1 of :func:`read_build`'s two.
    There is no marker to check it against, and there cannot be: nothing newer exists on this
    machine.
    """
    index: dict[str, Entry] = {}
    if documents is None:
        return index
    # A sequence, not any iterable. A caller who passed a mapping or a string meant something, and
    # guessing at it would be a guess about what is in a customer's prompt.
    if isinstance(documents, (str, bytes, Mapping)) or not isinstance(documents, Sequence):
        warn(SdkWarning("malformed", "bundled must be a list of build documents; it was ignored"))
        return index

    for position, document in enumerate(documents, start=1):
        read = check_build(document)
        if not read.ok:
            assert read.warning is not None
            warn(SdkWarning(read.warning.code, f"bundled build {position} was dropped: {read.warning.message}"))
            continue
        assert read.value is not None
        index[str(read.value["promptId"])] = Entry(build=read.value, version=None, published_at=None, etag=None)
    return index


def _resolve_entry(
    entry: Entry,
    source: ResolveSource,
    prompt_id: str,
    variables: Any,
    warn: WarningHandler,
) -> ResolveResult:
    """Bind one entry's build and report what happened.

    **A missing required variable is ``unavailable``, not a prompt with a hole in it.** The
    alternative is shipping ``{{customer_name}}`` to a model, which produces a plausible answer
    about a customer called "customer_name". The names are in ``missing`` and the caller is warned.
    """
    values = _to_values(variables, warn)
    build = entry.build
    variables_declared = build.get("variables")
    declarations = variables_declared if isinstance(variables_declared, list) else []
    bound = bind_variables(str(build.get("text", "")), values, declarations)

    version = entry.version
    build_hash = build.get("buildHash")
    model = build.get("model")

    if not bound.ok:
        warn(
            SdkWarning(
                "missing_variables",
                f"no value was supplied for {', '.join(bound.missing)}, and neither has a default",
                prompt_id,
            )
        )
        return ResolveResult(
            status="unavailable",
            text="",
            source=source,
            prompt_id=prompt_id,
            version=version,
            build_hash=build_hash if isinstance(build_hash, str) else None,
            model=model if isinstance(model, str) else None,
            missing=bound.missing,
            used_defaults=(),
        )

    return ResolveResult(
        status="ok",
        text=bound.text,
        source=source,
        prompt_id=prompt_id,
        version=version,
        build_hash=build_hash if isinstance(build_hash, str) else None,
        model=model if isinstance(model, str) else None,
        missing=(),
        used_defaults=bound.used_defaults,
    )


class Client:
    """A configured client.

    Hold one for the lifetime of the process. Constructing one per request would start a refresh
    thread per request and lose the memory cache between them, which is every property this package
    exists for.

    Build one with :func:`create_client`; this class is not constructed directly, and its ``_``
    members are internal.
    """

    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        bundled: dict[str, Entry],
        cache_dir: str | None,
        refresh_seconds: float,
        jitter: float,
        timeout_seconds: float,
        client_header: str | None,
        warn: WarningHandler,
        http: Http | None,
        now: Any,
    ) -> None:
        self._warn = warn
        self._now = now
        self._refresh_seconds = refresh_seconds
        self._jitter = jitter
        self._cache_dir = cache_dir
        self._bundled = bundled

        self._memory: dict[str, Entry] = {}
        self._in_flight: dict[str, threading.Event] = {}
        self._last_attempt: dict[str, float] = {}
        # When the endpoint last told us to stop asking, as a clock reading before which no request
        # is made (EPIC-057).
        #
        # **Process-wide rather than per prompt.** The `/v1` limit is per API key, and every prompt
        # this client holds is behind the same key — so a 429 on one prompt's marker is the whole
        # client's news, and backing off only that prompt would keep the other nine hammering an
        # endpoint that has already said no.
        #
        # `0.0` means "no limit in effect", which is the state a well-behaved caller never leaves.
        self._refused_until = 0.0
        self._wanted: set[str] = set()
        self._disk_checked: set[str] = set()
        self._lock = threading.RLock()
        self._timer: threading.Timer | None = None
        self._closed = False
        self._warned_unconfigured = False

        self._network: NetworkConfig | None = (
            None
            if api_key is None
            else NetworkConfig(
                base_url=base_url,
                api_key=api_key,
                http=http or urllib_http,
                timeout_seconds=timeout_seconds,
                client_header=client_header,
            )
        )
        self._api_key = api_key

    # ── the three public methods ──────────────────────────────────────────────────────────────────

    def resolve(
        self,
        prompt_id: str,
        variables: Mapping[str, Any] | None = None,
        *,
        on_warning: WarningHandler | None = None,
    ) -> ResolveResult:
        """The Live prompt, with ``variables`` bound into it. **Never waits for the network.**"""
        warn = self._warn if on_warning is None else _guard(on_warning)

        if not isinstance(prompt_id, str) or not prompt_id:
            warn(SdkWarning("not_found", "resolve() was called without a prompt id"))
            return _unresolved(prompt_id if isinstance(prompt_id, str) else "")

        with self._lock:
            self._wanted.add(prompt_id)
            self._schedule()

            source: ResolveSource = "memory"
            entry = self._memory.get(prompt_id)
            if entry is None:
                entry = self._from_disk(prompt_id, warn)
                if entry is not None:
                    source = "disk"
                    self._memory[prompt_id] = entry
            if entry is None:
                entry = self._bundled.get(prompt_id)
                if entry is not None:
                    source = "bundled"

            # Stale, or never fetched. Started and not waited on: this call is answered from what is
            # already held, which is the whole of rule 8's first sentence.
            stale = self._now() - self._last_attempt.get(prompt_id, 0.0) >= self._refresh_seconds
            if stale:
                self._kick(prompt_id)

        if entry is None:
            warn(
                SdkWarning(
                    "not_found",
                    "nothing is cached for this prompt yet; a refresh is running in the background",
                    prompt_id,
                )
            )
            return _unresolved(prompt_id)
        return _resolve_entry(entry, source, prompt_id, variables, warn)

    def refresh(self, prompt_id: str | None = None) -> None:
        """Fetch now, and return when it is done.

        The one place waiting is allowed, because the caller asked. An application that wants to be
        warm before it serves its first request calls this once at start-up, **naming the prompt**.

        With no argument it refreshes every prompt the client has been asked for — which on a client
        that has just been constructed is **none of them**, so a bare ``refresh()`` at start-up
        fetches nothing. It cannot do otherwise: this package is never told which prompts an
        application will use. EPIC-054's drive found that documented the wrong way round in four
        places, this one included.

        **It waits rather than returning an awaitable**, where ``@41prompts/sdk`` returns a Promise.
        A Python caller who wants it off the main thread has ``threading`` and ``asyncio.to_thread``
        and did not need this package to choose one for them.
        """
        waits: list[threading.Event] = []
        with self._lock:
            if isinstance(prompt_id, str) and prompt_id:
                self._wanted.add(prompt_id)
                # Forced: a caller who asked for a refresh gets one whatever the staleness clock
                # says. It still joins an in-flight request rather than starting a second.
                waits.append(self._kick(prompt_id))
            else:
                waits = [self._kick(one) for one in list(self._wanted)]
        for done in waits:
            done.wait(timeout=60.0)

    def close(self) -> None:
        """Stop the refresh timer.

        A client that is not closed keeps refreshing, but never holds the process open: the timer is
        a daemon thread, so an interpreter that has finished exits rather than waiting up to
        ``refresh_seconds`` for a refresh nobody wants.
        """
        with self._lock:
            self._closed = True
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None

    # ── internals ─────────────────────────────────────────────────────────────────────────────────

    def _from_disk(self, prompt_id: str, warn: WarningHandler) -> Entry | None:
        if self._cache_dir is None or prompt_id in self._disk_checked:
            return None
        self._disk_checked.add(prompt_id)
        try:
            return read_from_disk(self._cache_dir, prompt_id, warn)
        except Exception:  # noqa: BLE001 - the cache is best effort and is never fatal
            return None

    def _fetch_once(self, prompt_id: str) -> None:
        network = self._network
        if network is None:
            with self._lock:
                first = not self._warned_unconfigured
                self._warned_unconfigured = True
            if first:
                self._warn(
                    SdkWarning(
                        "not_configured",
                        "no API key: pass api_key to create_client or set FORTYONE_API_KEY",
                        prompt_id,
                    )
                )
            return

        # The endpoint has already refused us and said when to come back. Asking again before then
        # is the behaviour that makes a rate limit cost the server more than the traffic it limited.
        with self._lock:
            if self._now() < self._refused_until:
                return
            held = self._memory.get(prompt_id)
        outcome = fetch_live(
            network,
            prompt_id,
            held.etag if held is not None else None,
            str(held.build.get("buildHash")) if held is not None else None,
        )

        if outcome.kind == "rate_limited":
            assert outcome.warning is not None
            wait = outcome.retry_after_seconds
            with self._lock:
                self._refused_until = self._now() + (wait if wait is not None else DEFAULT_RETRY_AFTER_SECONDS)
            self._warn(outcome.warning)
            return
        if outcome.kind == "warning":
            assert outcome.warning is not None
            self._warn(outcome.warning)
            return
        if outcome.kind == "unchanged":
            return
        if outcome.kind == "marker":
            with self._lock:
                current = self._memory.get(prompt_id)
                if current is None:
                    return
                self._memory[prompt_id] = Entry(
                    build=current.build,
                    version=outcome.version,
                    published_at=outcome.published_at,
                    etag=outcome.etag,
                )
            return

        assert outcome.entry is not None and outcome.build_text is not None
        # Memory first, then disk. A disk failure must never lose a build this process is holding.
        with self._lock:
            self._memory[prompt_id] = outcome.entry
            directory = self._cache_dir
        if directory is not None:
            try:
                write_to_disk(directory, prompt_id, outcome.entry, outcome.build_text, self._warn)
            except Exception:  # noqa: BLE001
                pass

    def _kick(self, prompt_id: str) -> threading.Event:
        """The one-flight rule. Everything that wants a fetch goes through here.

        A thousand concurrent ``resolve()`` calls for a prompt nobody holds are a thousand cache
        misses, and a thousand requests would be a self-inflicted outage on the first deploy of a
        busy service. The event is the whole mechanism: the second caller waits on the first
        caller's, and both see one request.

        Called with the lock held.
        """
        existing = self._in_flight.get(prompt_id)
        if existing is not None:
            return existing

        done = threading.Event()
        self._in_flight[prompt_id] = done
        # Recorded *before* the work starts, so a thousand resolves in one moment see one attempt.
        self._last_attempt[prompt_id] = self._now()

        def run() -> None:
            try:
                self._fetch_once(prompt_id)
            except Exception as failure:  # noqa: BLE001 - the backstop that keeps rule 8 true
                self._warn(SdkWarning("network", f"the refresh failed unexpectedly: {failure}", prompt_id))
            finally:
                with self._lock:
                    self._in_flight.pop(prompt_id, None)
                done.set()

        threading.Thread(target=run, name=f"fortyone-refresh-{prompt_id}", daemon=True).start()
        return done

    def _schedule(self) -> None:
        """The jittered periodic refresh. Called with the lock held.

        A fleet started by one deploy has every process on the same clock. Without jitter they ask
        together for ever, and the interval that was polite at one process is a spike at four
        hundred. The thread is a daemon so a script that resolves once and finishes still exits.
        """
        if self._closed or self._timer is not None or self._network is None:
            return
        spread = self._refresh_seconds * self._jitter
        delay = self._refresh_seconds - spread / 2 + random.random() * spread

        def tick() -> None:
            with self._lock:
                self._timer = None
                if self._closed:
                    return
                for prompt_id in list(self._wanted):
                    self._kick(prompt_id)
                self._schedule()

        timer = threading.Timer(delay, tick)
        timer.daemon = True
        timer.start()
        self._timer = timer


def create_client(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    bundled: Sequence[Any] | None = None,
    cache_dir: str | None | _Unset = UNSET,
    refresh_seconds: float = DEFAULT_REFRESH_SECONDS,
    jitter: float = DEFAULT_JITTER,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    telemetry: bool = False,
    on_warning: WarningHandler | None = None,
    http: Http | None = None,
    now: Any = None,
) -> Client:
    """Build a client.

    Every argument has a default. ``api_key`` falls back to ``FORTYONE_API_KEY`` and ``base_url`` to
    ``FORTYONE_BASE_URL`` — the two variables ``CLAUDE.md`` documents as being read by a customer's
    process rather than by ours.

    ``cache_dir=None`` turns the disk cache off, for a read-only filesystem or a process that would
    rather hold everything in memory. Not passing it uses ``<tmpdir>/41prompts-sdk``, which is the
    same directory ``@41prompts/sdk`` uses, on purpose (ruling 5).

    ``http`` and ``now`` are injected by tests. Nothing in this package's own suite reaches the
    network.

    **This never raises, for any argument.** An option of the wrong type falls back to its default
    rather than failing the constructor, because rule 8's promise covers the construction as much as
    the call — a client that cannot be built is an application that cannot start.
    """
    warn = _default_warner() if on_warning is None else _guard(on_warning)

    key = _text(api_key) or _from_env("FORTYONE_API_KEY")
    base = _text(base_url) or _from_env("FORTYONE_BASE_URL") or DEFAULT_BASE_URL

    if isinstance(cache_dir, _Unset):
        try:
            directory: str | None = default_cache_dir()
        except Exception:  # noqa: BLE001 - a sandbox with no temp directory still gets a client
            directory = None
    elif cache_dir is None:
        directory = None
    else:
        directory = _text(cache_dir)

    refresh = _positive(refresh_seconds, DEFAULT_REFRESH_SECONDS)
    timeout = _positive(timeout_seconds, DEFAULT_TIMEOUT_SECONDS)
    spread = (
        float(jitter)
        if not isinstance(jitter, bool) and isinstance(jitter, (int, float)) and 0 <= jitter <= 1
        else DEFAULT_JITTER
    )

    header: str | None = None
    if telemetry is True:
        identity = None if directory is None else install_id(directory)
        runtime = f"python{sys.version_info.major}{sys.version_info.minor}"
        header = f"py/{__version__}/{runtime}/{identity or 'anonymous'}"

    clock = _clock_of(now)

    return Client(
        api_key=key,
        base_url=base,
        bundled=_index_bundled(bundled, warn),
        cache_dir=directory,
        refresh_seconds=refresh,
        jitter=spread,
        timeout_seconds=timeout,
        client_header=header,
        warn=warn,
        http=http if callable(http) else None,
        now=clock,
    )


def _monotonic() -> float:
    return time.monotonic()


def _clock_of(candidate: Any) -> Callable[[], float]:
    """A clock that is a clock, whatever was passed.

    ``callable(now)`` is not enough and the fuzz proved it: ``now=lambda: None`` is callable, and
    subtracting its answer from a float raises inside ``resolve()`` — which would have been rule 8
    broken by an option nobody would knowingly pass. Checked on **every** call rather than once at
    construction, because a candidate that answers correctly once and badly later is no harder to
    pass than one that always does.
    """
    if not callable(candidate):
        return _monotonic

    def clock() -> float:
        try:
            value = candidate()
        except Exception:  # noqa: BLE001
            return _monotonic()
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
            return _monotonic()
        return float(value)

    return clock


# ── the module-level client ───────────────────────────────────────────────────────────────────────
#
# `docs/roadmap.md` writes the API as `resolve()`, and a great many applications want exactly that:
# one prompt id, one mapping, no object to hold. It is a lazily created client configured from
# `FORTYONE_API_KEY` — and `configure()` is how an application that wants `bundled=`, a cache
# directory or a warning handler gets them without restructuring around a client it passes around.

_default: Client | None = None
_default_lock = threading.Lock()


def configure(**options: Any) -> None:
    """Replace the module-level client, closing the one it replaces.

    Takes everything :func:`create_client` takes. Closing the old one means calling this twice does
    not leave a refresh thread running for a client nothing can reach.
    """
    global _default
    with _default_lock:
        if _default is not None:
            _default.close()
        _default = create_client(**options)


def resolve(
    prompt_id: str,
    variables: Mapping[str, Any] | None = None,
    *,
    on_warning: WarningHandler | None = None,
) -> ResolveResult:
    """The Live prompt, from the module-level client. See :meth:`Client.resolve`."""
    global _default
    with _default_lock:
        if _default is None:
            _default = create_client()
        client = _default
    return client.resolve(prompt_id, variables, on_warning=on_warning)
