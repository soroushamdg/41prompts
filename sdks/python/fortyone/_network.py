# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""The background fetch (EPIC-054), over the standard library and nothing else.

The counterpart of ``packages/sdk-ts/src/network.ts``.

**Two requests, and the second one usually does not happen.**

1. ``GET /v1/marker/:promptId`` — what is Live. Conditional on the ``ETag`` from last time, so the
   steady state is a 304 with no body.
2. ``GET /v1/build/:buildHash`` — the document, **only when that hash is not already held**. A build
   is immutable and content-addressed, so a build we have is a build we never re-fetch.

Both routes redirect to wherever the store puts the bytes. That is the point of them: the SDK knows
an identity and the server knows an address, and a reader that derived the address would be carrying
a copy of the server's key layout into every customer's environment.

**The key is dropped on a cross-origin redirect, and that is not what ``urllib`` does by default.**
``fetch`` strips ``Authorization`` when a redirect crosses an origin; ``urllib``'s redirect handler
copies the request's headers through unchanged, which would send a customer's API key to whichever
CDN the store redirects to. The build is public (ADR-005 section 1) and the CDN has no key to check,
so the header buys nothing and leaks a credential into somebody else's access log.
:class:`_DropAuthOnCrossOrigin` is that fix, and ``tests/test_network.py`` proves it by following a
redirect to another host and reading what arrived.

**Nothing here raises, and a timeout is not an exception either.** Every failure becomes a warning
the caller is handed.

**A 429 is honoured (EPIC-057).** ``/v1`` is rate limited, and a client that ignores the refusal
makes the endpoint pay for it at the same rate it paid for the answer. A 429 comes back as its own
outcome carrying ``Retry-After`` and ``__init__`` stops asking until it has passed. This is one of
two places this package is stricter than ``@41prompts/sdk``, which cannot afford the code inside
ADR-006's 15 KB bundle budget (EPIC-057 ruling 11); the divergence table in ``README.md`` says so.

**A response is read to a limit.** ``urllib`` will happily read a body for as long as a server keeps
sending one, and the SDK's whole promise is that we cannot take a customer's application down. The
limit is generous against any real build and finite against a server that has stopped being one; a
body that exceeds it is refused rather than truncated, because a truncated document would fail its
content address and report as tampering.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Mapping

from ._disk import Entry
from ._types import SdkWarning, WarningCode
from ._verify import read_build, read_marker

__all__ = [
    "DEFAULT_RETRY_AFTER_SECONDS",
    "Http",
    "HttpResponse",
    "NetworkConfig",
    "Outcome",
    "fetch_live",
    "urllib_http",
]

# 16 MiB. A compiled prompt with its bloks, spans and checks is kilobytes; a hundred times the
# largest plausible build is still nothing, and an unbounded read is a memory exhaustion somebody
# else controls.
MAX_BODY_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class HttpResponse:
    """What this package reads off a response. A value, so a test can make one without a server."""

    status: int
    headers: Mapping[str, str]
    body: str


# The subset of HTTP this package performs: one GET, some headers, a timeout in **seconds**.
# A callable rather than a class so a test passes a function, and so nothing here is subclassable
# by a customer who would then be depending on an internal shape.
Http = Callable[[str, Mapping[str, str], float], HttpResponse]


class _DropAuthOnCrossOrigin(urllib.request.HTTPRedirectHandler):
    """Strip ``Authorization`` when a redirect leaves the origin it was sent to.

    See the module docstring. This is what ``fetch`` does and what ``urllib`` does not.
    """

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        following = super().redirect_request(req, fp, code, msg, headers, newurl)
        if following is None:
            return None
        if _origin(req.full_url) != _origin(following.full_url):
            for name in list(following.headers):
                if name.lower() == "authorization":
                    del following.headers[name]
            following.unredirected_hdrs.pop("Authorization", None)
        return following


def _origin(url: str) -> tuple[str, str, int | None]:
    parts = urllib.parse.urlsplit(url)
    return (parts.scheme, parts.hostname or "", parts.port)


_OPENER = urllib.request.build_opener(_DropAuthOnCrossOrigin())


def urllib_http(url: str, headers: Mapping[str, str], timeout_seconds: float) -> HttpResponse:
    """The default transport: ``urllib``, standard library, no dependency.

    A non-2xx answer arrives as an ``HTTPError``, which is also a response — 304 in particular,
    which is the steady state and not an error at all. Both paths return the same value.
    """
    if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
        raise ValueError("only http and https are fetched")
    request = urllib.request.Request(url, method="GET")
    for name, value in headers.items():
        request.add_header(name, value)
    try:
        with _OPENER.open(request, timeout=timeout_seconds) as answer:
            return _response_of(answer.status, answer.headers, answer)
    except urllib.error.HTTPError as answer:
        return _response_of(answer.code, answer.headers, answer)


def _response_of(status: int, headers: Any, stream: Any) -> HttpResponse:
    raw = stream.read(MAX_BODY_BYTES + 1)
    if len(raw) > MAX_BODY_BYTES:
        raise ValueError(f"the response is larger than {MAX_BODY_BYTES} bytes")
    return HttpResponse(
        status=status,
        headers={str(name).lower(): str(value) for name, value in headers.items()},
        body=raw.decode("utf-8", "replace"),
    )


@dataclass(frozen=True)
class NetworkConfig:
    base_url: str
    api_key: str
    http: Http
    timeout_seconds: float
    # The one telemetry header, or None when telemetry is off — which is the default.
    client_header: str | None = None


@dataclass(frozen=True)
class Outcome:
    """What one refresh produced.

    ``kind`` is one of:

    ``unchanged``
        A 304. The Live marker has not moved and no body was transferred.
    ``marker``
        The marker was read and names a build already held. Its own outcome rather than a second
        ``unchanged``, because the marker facts **did** arrive and discarding them would leave the
        client requesting unconditionally for ever: a lost ``ETag`` would never be replaced, and an
        undo back to a build still in memory would keep reporting the version it undid from.
    ``entry``
        A new Live build. ``build_text`` is the bytes as they arrived, for the disk cache to store.
    ``rate_limited``
        The endpoint refused us for asking too often and said when to come back (EPIC-057). Its own
        kind rather than a ``warning``, because the caller has to *do* something with it — stop
        asking — and a warning is a thing a caller reads. The warning is raised as well, so nothing
        is silent.
    ``warning``
        Something went wrong, and it is a value rather than an exception.
    """

    kind: str
    version: int | None = None
    published_at: str | None = None
    etag: str | None = None
    entry: Entry | None = None
    build_text: str | None = None
    warning: SdkWarning | None = None
    retry_after_seconds: float | None = None


# How long a 429 is honoured for when ``Retry-After`` is missing or is not delta-seconds.
#
# A 429 with no header is still a refusal, and reading it as "come back immediately" would make the
# unluckiest clients the loudest. ``Retry-After`` may also be an HTTP-date; parsing one needs a
# clock this module does not have, so a date falls through to this default. The one-day ceiling is
# so a server saying "a year" cannot silently retire a client for ever.
DEFAULT_RETRY_AFTER_SECONDS = 60.0
_MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60.0


def _retry_after_of(response: HttpResponse) -> float:
    """Seconds from a ``Retry-After``, or the default. Delta-seconds only; never a date."""
    # Header names are case-insensitive over the wire and this is a plain mapping, so both spellings
    # are tried rather than assuming whichever one the last server used.
    raw = response.headers.get("retry-after") or response.headers.get("Retry-After")
    if raw is None:
        return DEFAULT_RETRY_AFTER_SECONDS
    try:
        seconds = float(int(str(raw).strip()))
    except ValueError:
        return DEFAULT_RETRY_AFTER_SECONDS
    if seconds < 0:
        return DEFAULT_RETRY_AFTER_SECONDS
    return min(seconds, _MAX_RETRY_AFTER_SECONDS)


def _failure(status: int, what: str, prompt_id: str) -> SdkWarning:
    if status == 401:
        return SdkWarning("unauthorised", f"the API key was refused while fetching the {what}", prompt_id)
    if status == 403:
        return SdkWarning("unauthorised", "the API key is scoped to another project", prompt_id)
    if status == 404:
        return SdkWarning("not_found", "nothing is published for this prompt", prompt_id)
    if status == 429:
        # The code stays ``network``. ``WarningCode`` is frozen for the TypeScript SDK by ADR-006
        # section 1, and the two surfaces are held in parity by ``tests/test_divergence.py`` — so a
        # code that exists in one language and not the other would be a divergence bought for a
        # branch a caller can already make on the message.
        return SdkWarning(
            "network",
            f"the {what} request was rate limited (429); the background refresh will wait",
            prompt_id,
        )
    return SdkWarning("network", f"the {what} request answered {status}", prompt_id)


def _headers(config: NetworkConfig, etag: str | None) -> dict[str, str]:
    out = {"authorization": f"Bearer {config.api_key}", "accept": "application/json"}
    if etag is not None:
        out["if-none-match"] = etag
    # Off by default (`CLAUDE.md` rule 8). When on it rides a request that was happening anyway;
    # this package never sends a request of its own to report anything.
    if config.client_header is not None:
        out["41p-client"] = config.client_header
    return out


def _get(config: NetworkConfig, url: str, etag: str | None) -> HttpResponse | str:
    """The response, or the message explaining why there is not one."""
    try:
        return config.http(url, _headers(config, etag), config.timeout_seconds)
    except Exception as failure:  # noqa: BLE001 - rule 8: nothing reaches a caller as an exception
        return str(failure) or failure.__class__.__name__


def fetch_live(config: NetworkConfig, prompt_id: str, etag: str | None, held: str | None) -> Outcome:
    """Fetch what is Live for one prompt.

    ``held`` is the build hash already in memory, so an unchanged marker with a lost ``ETag`` still
    costs one request rather than two.
    """
    base = config.base_url.rstrip("/")
    marker_url = f"{base}/v1/marker/{urllib.parse.quote(prompt_id, safe='')}"

    marker_got = _get(config, marker_url, etag)
    if isinstance(marker_got, str):
        return Outcome("warning", warning=SdkWarning("network", marker_got, prompt_id))
    if marker_got.status == 304:
        return Outcome("unchanged")
    if marker_got.status == 429:
        return Outcome(
            "rate_limited",
            warning=_failure(429, "Live marker", prompt_id),
            retry_after_seconds=_retry_after_of(marker_got),
        )
    if not 200 <= marker_got.status < 300:
        return Outcome("warning", warning=_failure(marker_got.status, "Live marker", prompt_id))

    marker = read_marker(marker_got.body)
    if not marker.ok:
        assert marker.warning is not None
        return Outcome("warning", warning=_with_prompt(marker.warning, prompt_id))
    assert marker.value is not None
    if marker.value["promptId"] != prompt_id:
        return Outcome("warning", warning=SdkWarning("malformed", "the Live marker names a different prompt", prompt_id))

    next_etag = marker_got.headers.get("etag")

    if held is not None and held == marker.value["buildHash"]:
        # The marker names the build we already hold — an undo back to it, or an `ETag` we lost.
        # Nothing to download; the caller keeps its build and takes the marker facts.
        return Outcome(
            "marker",
            version=marker.value["version"],
            published_at=marker.value["publishedAt"],
            etag=next_etag,
        )

    build_url = f"{base}/v1/build/{urllib.parse.quote(marker.value['buildHash'], safe='')}"
    build_got = _get(config, build_url, None)
    if isinstance(build_got, str):
        return Outcome("warning", warning=SdkWarning("network", build_got, prompt_id))
    if not 200 <= build_got.status < 300:
        if build_got.status == 429:
            return Outcome(
                "rate_limited",
                warning=_failure(429, "build", prompt_id),
                retry_after_seconds=_retry_after_of(build_got),
            )
        return Outcome("warning", warning=_failure(build_got.status, "build", prompt_id))

    # Both halves of the roadmap's "artifact sha verified against pointer": the document hashes to
    # its own address, and that address is the one the marker named.
    build = read_build(build_got.body, marker.value["buildHash"])
    if not build.ok:
        assert build.warning is not None
        return Outcome("warning", warning=_with_prompt(build.warning, prompt_id))
    assert build.value is not None

    return Outcome(
        "entry",
        entry=Entry(
            build=build.value,
            version=marker.value["version"],
            published_at=marker.value["publishedAt"],
            etag=next_etag,
        ),
        build_text=build_got.body,
    )


def _with_prompt(warning: SdkWarning, prompt_id: str) -> SdkWarning:
    code: WarningCode = warning.code
    return SdkWarning(code, warning.message, prompt_id)
