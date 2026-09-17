# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""Stale (EPIC-054 C7) — the roadmap's other named Tests line.

The clock is injected rather than waited on. A test that slept for thirty-one seconds would be
asserting that `time.sleep` works; what is under test is what happens **when the clock says the
entry is old**, and that is a different claim.
"""

from __future__ import annotations

import time
from typing import Any, Iterator, Mapping

import pytest

import fortyone
from fortyone._network import HttpResponse
from tests._support import BUILD, BUILD_TEXT, Clock, FakeHttp, PROMPT_ID, live_routes, marker_for, ok, rebuild


@pytest.fixture
def clients() -> Iterator[list[fortyone.Client]]:
    made: list[fortyone.Client] = []
    yield made
    for client in made:
        client.close()


def make(made: list[fortyone.Client], **options: Any) -> fortyone.Client:
    client = fortyone.create_client(**options)
    made.append(client)
    return client


def test_a_stale_entry_is_still_answered_immediately_and_refreshed_behind_it(
    clients: list[fortyone.Client],
) -> None:
    clock = Clock()
    newer, newer_text = rebuild(text="Version two for {{company}}.")
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT, version=6))

    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock)
    client.refresh(PROMPT_ID)
    assert client.resolve(PROMPT_ID, {"company": "N"}).version == 6

    # The server moves on, and the clock passes the refresh interval.
    http.routes = live_routes(newer, newer_text, version=7)
    clock.advance(31)

    # This call is answered from what is held — the old version — and starts a refresh behind it.
    served = client.resolve(PROMPT_ID, {"company": "N"})
    assert served.version == 6, "a stale entry must be served, not waited on"

    _settle(client)
    assert client.resolve(PROMPT_ID, {"company": "Northwind"}).version == 7


def test_a_fresh_entry_starts_no_request_at_all(clients: list[fortyone.Client]) -> None:
    clock = Clock()
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock)
    client.refresh(PROMPT_ID)
    _settle(client)
    before = len(http.urls)

    for _ in range(20):
        client.resolve(PROMPT_ID, {"company": "N"})
    _settle(client)
    assert len(http.urls) == before, "a fresh entry must not be re-fetched on every call"


def test_a_304_leaves_the_entry_alone_and_transfers_no_body(clients: list[fortyone.Client]) -> None:
    clock = Clock()
    routes = live_routes(BUILD, BUILD_TEXT, version=6, etag='"the-tag"')
    http = FakeHttp(routes)
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock)
    client.refresh(PROMPT_ID)

    # The steady state: the marker has not moved, so the server answers 304 with nothing in it.
    http.routes = {f"v1/marker/{PROMPT_ID}": HttpResponse(status=304, headers={}, body="")}
    clock.advance(31)
    client.refresh(PROMPT_ID)

    result = client.resolve(PROMPT_ID, {"company": "N"})
    assert result.version == 6 and result.status == "ok"
    # And the conditional request carried the tag it was given.
    assert http.header_for(f"v1/marker/{PROMPT_ID}", "if-none-match") == '"the-tag"'


def test_a_marker_naming_a_build_already_held_costs_one_request_and_keeps_the_facts(
    clients: list[fortyone.Client],
) -> None:
    """Undo, or an `ETag` we lost. The marker facts arrived and must not be discarded.

    Discarding them would leave the client requesting unconditionally for ever, and an undo back to
    a build still in memory would keep reporting the version it undid from.
    """
    clock = Clock()
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT, version=6, etag='"one"'))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock)
    client.refresh(PROMPT_ID)

    http.routes = {f"v1/marker/{PROMPT_ID}": ok(marker_for(BUILD, version=8), '"two"')}
    clock.advance(31)
    before = len(http.urls)
    client.refresh(PROMPT_ID)
    after = len(http.urls)

    assert after - before == 1, "a build already held must not be downloaded again"
    assert client.resolve(PROMPT_ID, {"company": "N"}).version == 8


def test_a_marker_for_another_prompt_is_refused(clients: list[fortyone.Client]) -> None:
    warnings: list[fortyone.SdkWarning] = []
    other, _ = rebuild(promptId="pr_ffffffff")
    http = FakeHttp({f"v1/marker/{PROMPT_ID}": ok(marker_for(other))})
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, on_warning=warnings.append)
    client.refresh(PROMPT_ID)
    assert [w.code for w in warnings] == ["malformed"]


def test_a_build_that_is_not_the_one_the_marker_names_is_refused(clients: list[fortyone.Client]) -> None:
    """The substitution attack, and the only check that catches it.

    The document is intact and hashes to its own address. It is simply not the one that is Live.
    """
    warnings: list[fortyone.SdkWarning] = []
    other, other_text = rebuild(text="A different prompt entirely.")
    http = FakeHttp(
        {
            f"v1/marker/{PROMPT_ID}": ok(marker_for(BUILD)),
            f"v1/build/{BUILD['buildHash']}": ok(other_text),
        }
    )
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, on_warning=warnings.append)
    client.refresh(PROMPT_ID)

    assert [w.code for w in warnings] == ["hash_mismatch"]
    assert client.resolve(PROMPT_ID, {"company": "N"}).status == "unavailable"


@pytest.mark.parametrize(("status", "code"), [(401, "unauthorised"), (403, "unauthorised"), (404, "not_found"), (500, "network")])
def test_every_refusal_has_its_own_warning(clients: list[fortyone.Client], status: int, code: str) -> None:
    warnings: list[fortyone.SdkWarning] = []
    http = FakeHttp({f"v1/marker/{PROMPT_ID}": HttpResponse(status=status, headers={}, body="")})
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, on_warning=warnings.append)
    client.refresh(PROMPT_ID)
    assert [w.code for w in warnings] == [code]


def _settle(client: fortyone.Client) -> None:
    """Wait for **this client's** background refreshes to finish, on a condition not a duration.

    `docs/PROCESS.md`: a helper that normalises state must say what it waits for and what it could
    hide. It waits for the client's in-flight map to empty, which is the exact thing the test is
    about. A `_kick` registers itself in that map *before* its thread starts, so a refresh that was
    started is never missed and this cannot return early.

    What it could hide: a refresh started after it returns. Nothing in the client does that — a
    kick happens inside `resolve`, `refresh` or the timer tick — and every test here asserts an
    outcome rather than a count of threads, so a late one would still change the answer.

    **It is per client, and the first version was not.** Scanning `threading.enumerate()` for
    `fortyone-refresh-` threads passed in isolation and timed out in the full suite, because another
    module deliberately leaves a transport sleeping for ten seconds. A helper that waits on global
    state waits on other tests.
    """
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        with client._lock:  # noqa: SLF001 - this package's own suite, and the exact condition
            if not client._in_flight:  # noqa: SLF001
                return
        time.sleep(0.005)
    raise AssertionError("a refresh did not finish within five seconds")


def test_refresh_with_no_argument_fetches_nothing_on_a_fresh_client(clients: list[fortyone.Client]) -> None:
    """The defect EPIC-054's drive found, in the SDK it was ported from and in this one.

    `refresh()` with no argument refreshes every prompt the client has been asked for, and a client
    that has just been constructed has been asked for none. It cannot do otherwise: this package is
    never told which prompts an application will use.

    The behaviour is right; the documentation was not. Four places printed the bare call as the way
    to be warm before the first request — `packages/sdk-ts/README.md`, that package's own example,
    the Connect page's fourth step and this package's README — and it fetched nothing, so an
    application that followed the instruction got exactly the cold start the instruction exists to
    avoid. Nothing in either suite crossed it, because every other refresh test resolves first.
    """
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http)

    client.refresh()

    assert http.urls == []
    assert client.resolve(PROMPT_ID, {"company": "N"}).status == "unavailable"


def test_but_naming_the_prompt_fetches_it(clients: list[fortyone.Client]) -> None:
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http)

    client.refresh(PROMPT_ID)

    assert http.urls, "the control: refresh(prompt_id) does reach the server"
    assert client.resolve(PROMPT_ID, {"company": "Northwind"}).status == "ok"
