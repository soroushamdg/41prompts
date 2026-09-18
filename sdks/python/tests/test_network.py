# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""The default transport, against a real socket (EPIC-054).

Everything else in this suite injects a transport. This file exercises the one that ships — a local
``http.server`` on a loopback port, which is not the network in any sense that matters and is the
only way to test what ``urllib`` actually does with a redirect.

**The test that earns this file is the first one.** ``/v1/marker`` redirects to wherever the store
put the bytes, and ``urllib``'s redirect handler copies the request's headers through unchanged — so
the default transport would have sent a customer's API key to whichever CDN the redirect names.
``fetch`` drops it; ``urllib`` does not; this proves the fix by reading what the second host
received.
"""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Iterator

import pytest

from fortyone._network import MAX_BODY_BYTES, urllib_http


class _Recorder(BaseHTTPRequestHandler):
    """Two routes: one redirects to the other host, the other records what arrived."""

    received: list[dict[str, str]] = []
    other: str = ""
    body: bytes = b"{}"

    def do_GET(self) -> None:  # noqa: N802 - the base class names it
        type(self).received.append({k.lower(): v for k, v in self.headers.items()})
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", f"{type(self).other}/landed")
            self.end_headers()
            return
        if self.path == "/teapot":
            self.send_response(418)
            self.end_headers()
            self.wfile.write(b"short and stout")
            return
        self.send_response(200)
        self.send_header("ETag", '"served"')
        self.end_headers()
        self.wfile.write(type(self).body)

    def log_message(self, *_args: Any) -> None:
        return


def _serve() -> tuple[HTTPServer, str]:
    server = HTTPServer(("127.0.0.1", 0), _Recorder)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


@pytest.fixture
def servers() -> Iterator[tuple[str, str]]:
    _Recorder.received = []
    first, first_url = _serve()
    second, second_url = _serve()
    # 127.0.0.1 and localhost are the same machine and **different origins**, which is what the
    # redirect rule is about. Using two ports of one host would not exercise it.
    _Recorder.other = second_url.replace("127.0.0.1", "localhost")
    yield first_url, _Recorder.other
    first.shutdown()
    second.shutdown()


def test_the_key_is_dropped_when_a_redirect_leaves_the_origin(servers: tuple[str, str]) -> None:
    first, _second = servers
    answer = urllib_http(f"{first}/redirect", {"authorization": "Bearer 41p_live_secret"}, 5.0)

    assert answer.status == 200
    assert len(_Recorder.received) == 2, "the redirect was not followed, so this asserts nothing"
    sent, arrived = _Recorder.received
    # The control and the claim, side by side: the first host was given the key, the second was not.
    assert sent["authorization"] == "Bearer 41p_live_secret"
    assert "authorization" not in arrived


def test_the_key_survives_a_redirect_inside_the_same_origin(servers: tuple[str, str]) -> None:
    first, _second = servers
    _Recorder.other = first
    urllib_http(f"{first}/redirect", {"authorization": "Bearer 41p_live_secret"}, 5.0)

    assert len(_Recorder.received) == 2
    assert _Recorder.received[1]["authorization"] == "Bearer 41p_live_secret"


def test_a_non_2xx_answer_is_a_response_and_not_an_exception(servers: tuple[str, str]) -> None:
    first, _second = servers
    answer = urllib_http(f"{first}/teapot", {}, 5.0)
    assert answer.status == 418
    assert answer.body == "short and stout"


def test_headers_come_back_lowercased(servers: tuple[str, str]) -> None:
    first, _second = servers
    answer = urllib_http(f"{first}/anything", {}, 5.0)
    assert answer.headers["etag"] == '"served"'


def test_a_body_larger_than_the_limit_is_refused_rather_than_truncated(servers: tuple[str, str]) -> None:
    """A truncated document would fail its content address and report as tampering.

    So the read has a limit and exceeding it is an error, not a short answer: an honest transport
    failure is a `network` warning, and a silent truncation would be a `hash_mismatch` — which means
    something entirely different to whoever reads the log.
    """
    first, _second = servers
    _Recorder.body = b"x" * (MAX_BODY_BYTES + 10)
    try:
        with pytest.raises(ValueError):
            urllib_http(f"{first}/big", {}, 20.0)
    finally:
        _Recorder.body = b"{}"


def test_only_http_and_https_are_fetched() -> None:
    # `file:///etc/passwd` is a URL `urllib` will happily open. A base URL comes from configuration,
    # and configuration is a place a mistake or an attacker can reach.
    for url in ("file:///etc/passwd", "ftp://example.com/x", "data:text/plain,hello"):
        with pytest.raises(ValueError):
            urllib_http(url, {}, 1.0)
