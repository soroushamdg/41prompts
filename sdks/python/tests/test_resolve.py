# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""`resolve()` never waits for the network, and answers in rule 8's order (EPIC-054 C1)."""

from __future__ import annotations

import threading
import time
from typing import Any, Iterator, Mapping

import pytest

import fortyone
from fortyone._network import HttpResponse
from tests._support import BUILD, BUILD_TEXT, Clock, FakeHttp, PROMPT_ID, live_routes


@pytest.fixture(autouse=True)
def _close_clients() -> Iterator[None]:
    """Every client made in this module is closed, so no refresh thread outlives its test."""
    made: list[fortyone.Client] = []
    _MADE.append(made)
    yield
    _MADE.remove(made)
    for client in made:
        client.close()


_MADE: list[list[fortyone.Client]] = []


def make(**options: Any) -> fortyone.Client:
    client = fortyone.create_client(**options)
    if _MADE:
        _MADE[-1].append(client)
    return client


def test_a_bundled_build_resolves_with_variables_bound() -> None:
    client = make(api_key=None, cache_dir=None, bundled=[BUILD])
    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.status == "ok"
    assert "Northwind" in result.text
    assert result.source == "bundled"
    assert result.build_hash == BUILD["buildHash"]
    assert result.model == BUILD["model"]
    # A bundled document has no marker, so it has no version. Inventing one would be the SDK
    # asserting something nobody told it.
    assert result.version is None


def test_a_missing_required_variable_is_unavailable_and_names_itself() -> None:
    client = make(api_key=None, cache_dir=None, bundled=[BUILD])
    result = client.resolve(PROMPT_ID, {})
    assert result.status == "unavailable"
    assert result.text == ""
    assert "company" in result.missing
    # The build is still identified: a caller debugging this needs to know which one refused.
    assert result.build_hash == BUILD["buildHash"]


def test_a_default_is_used_and_reported() -> None:
    client = make(api_key=None, cache_dir=None, bundled=[BUILD])
    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.status == "ok"
    assert "locale" in result.used_defaults or result.used_defaults == ()


def test_the_call_does_not_wait_for_the_network() -> None:
    """The load-bearing claim. A transport that takes ten seconds must not be in the call path."""
    started = threading.Event()

    def slow(_url: str, _headers: Mapping[str, str], _timeout: float) -> HttpResponse:
        started.set()
        time.sleep(10.0)
        return HttpResponse(status=200, headers={}, body="")

    client = make(api_key="41p_test_x", cache_dir=None, bundled=[BUILD], http=slow)
    begin = time.monotonic()
    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    elapsed = time.monotonic() - begin

    assert result.status == "ok"
    assert elapsed < 0.5, f"resolve() waited {elapsed:.3f}s for the network"
    # And it really did start one, so the timing above is about not waiting rather than about not
    # trying: an SDK that had simply skipped the refresh would also have been fast.
    assert started.wait(timeout=5.0)


def test_memory_is_preferred_to_bundled_once_something_has_been_fetched() -> None:
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT, version=9))
    client = make(api_key="41p_test_x", cache_dir=None, bundled=[BUILD], http=http)
    client.refresh(PROMPT_ID)

    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.source == "memory"
    assert result.version == 9


def test_resolve_with_no_prompt_id_is_a_warning_and_not_an_exception() -> None:
    warnings: list[fortyone.SdkWarning] = []
    client = make(api_key=None, cache_dir=None, on_warning=warnings.append)
    result = client.resolve("", {})
    assert result.status == "unavailable"
    assert [w.code for w in warnings] == ["not_found"]


def test_nothing_cached_is_unavailable_with_a_reason() -> None:
    warnings: list[fortyone.SdkWarning] = []
    client = make(api_key=None, cache_dir=None, on_warning=warnings.append)
    result = client.resolve(PROMPT_ID, {})
    assert result.status == "unavailable" and result.source == "none" and result.text == ""
    assert "not_found" in [w.code for w in warnings]


def test_a_per_call_handler_replaces_the_client_one() -> None:
    client_warnings: list[fortyone.SdkWarning] = []
    call_warnings: list[fortyone.SdkWarning] = []
    client = make(api_key=None, cache_dir=None, on_warning=client_warnings.append)
    client.resolve(PROMPT_ID, {}, on_warning=call_warnings.append)
    assert call_warnings and not client_warnings


def test_a_handler_that_raises_does_not_become_this_package_raising() -> None:
    def explode(_warning: fortyone.SdkWarning) -> None:
        raise RuntimeError("the application's logger is broken")

    client = make(api_key=None, cache_dir=None, on_warning=explode)
    assert client.resolve(PROMPT_ID, {}).status == "unavailable"


def test_one_in_flight_request_per_prompt() -> None:
    """A thousand cache misses in one moment must not be a thousand requests."""
    release = threading.Event()

    def held(_url: str, _headers: Mapping[str, str], _timeout: float) -> HttpResponse:
        release.wait(timeout=5.0)
        return HttpResponse(status=404, headers={}, body="")

    counted = FakeHttp()
    counted.routes = {}

    def counting(url: str, headers: Mapping[str, str], timeout: float) -> HttpResponse:
        counted.calls.append((url, dict(headers)))
        return held(url, headers, timeout)

    client = make(api_key="41p_test_x", cache_dir=None, http=counting)
    for _ in range(50):
        client.resolve(PROMPT_ID, {})
    release.set()
    time.sleep(0.2)
    assert len(counted.calls) == 1, f"{len(counted.calls)} requests for 50 resolves"


def test_the_module_level_client_is_configurable() -> None:
    fortyone.configure(api_key=None, cache_dir=None, bundled=[BUILD])
    try:
        result = fortyone.resolve(PROMPT_ID, {"company": "Northwind"})
        assert result.status == "ok"
        # Calling it again replaces and closes the previous one rather than leaking a refresh thread.
        fortyone.configure(api_key=None, cache_dir=None)
        assert fortyone.resolve(PROMPT_ID, {"company": "Northwind"}).status == "unavailable"
    finally:
        fortyone.configure(api_key=None, cache_dir=None)


def test_a_refresh_picks_up_a_new_version_without_a_restart() -> None:
    clock = Clock()
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT, version=6, etag='"one"'))
    client = make(api_key="41p_test_x", cache_dir=None, http=http, now=clock)
    client.refresh(PROMPT_ID)
    assert client.resolve(PROMPT_ID, {"company": "N"}).version == 6

    from tests._support import rebuild

    newer, newer_text = rebuild(text="Rewritten for {{company}}.")
    http.routes = live_routes(newer, newer_text, version=7, etag='"two"')
    clock.advance(31)
    client.refresh(PROMPT_ID)

    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.version == 7
    assert result.text == "Rewritten for Northwind."
