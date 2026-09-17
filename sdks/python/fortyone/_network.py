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

__all__ = ["HttpResponse", "Http", "NetworkConfig", "Outcome", "fetch_live", "urllib_http"]

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


def _failure(status: int, what: str, prompt_id: str) -> SdkWarning:
    if status == 401:
        return SdkWarning("unauthorised", f"the API key was refused while fetching the {what}", prompt_id)
    if status == 403:
        return SdkWarning("unauthorised", "the API key is scoped to another project", prompt_id)
    if status == 404:
        return SdkWarning("not_found", "nothing is published for this prompt", prompt_id)
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
