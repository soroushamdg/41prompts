# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""A 429 is honoured (EPIC-057 C9).

`/v1` is rate limited since EPIC-057, and a client that ignores the refusal makes the endpoint pay
for it at the same rate it paid for the answer. So a 429 stops the background refresh until
`Retry-After` has passed.

**Every test here counts requests**, because the claim is about requests that do *not* happen — and
an assertion about an absence needs a positive control, which is why each one also proves the same
client keeps asking when it was never refused.

The clock is injected. A test that slept would be asserting that `time.sleep` works.
"""

from __future__ import annotations

from typing import Any, Iterator

import pytest

import fortyone
from fortyone._network import DEFAULT_RETRY_AFTER_SECONDS, HttpResponse
from tests._support import BUILD, BUILD_TEXT, Clock, FakeHttp, PROMPT_ID, live_routes


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


def refused(retry_after: str | None = "120") -> dict[str, Any]:
    """Both `/v1` routes answering 429, the way `rateLimitedResponse` does."""
    headers = {} if retry_after is None else {"retry-after": retry_after}
    body = '{"error":"rate_limited","message":"That is the limit for now."}'
    answer = HttpResponse(status=429, headers=headers, body=body)
    return {
        f"v1/marker/{PROMPT_ID}": answer,
        f"v1/build/{BUILD['buildHash']}": answer,
    }


def test_a_429_stops_the_next_request_until_retry_after_has_passed(clients: list[fortyone.Client]) -> None:
    clock = Clock()
    http = FakeHttp(refused("120"))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    assert len(http.urls) == 1, http.urls

    # Well inside the 120 seconds the server asked for. Nothing may go out.
    clock.advance(60)
    client.refresh(PROMPT_ID)
    assert len(http.urls) == 1, http.urls

    # Past it. The client resumes rather than retiring itself.
    clock.advance(61)
    client.refresh(PROMPT_ID)
    assert len(http.urls) == 2, http.urls


def test_a_client_that_was_never_refused_keeps_asking(clients: list[fortyone.Client]) -> None:
    """The control for the test above.

    Same clock, same advances, same calls — a healthy server. If this were to show one request as
    well, the test above would be measuring the one-flight rule or the staleness window rather than
    the back-off.
    """
    clock = Clock()
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT, version=6))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    first = len(http.urls)
    clock.advance(60)
    client.refresh(PROMPT_ID)
    clock.advance(61)
    client.refresh(PROMPT_ID)

    assert len(http.urls) > first


def test_the_refusal_is_process_wide_and_not_per_prompt(clients: list[fortyone.Client]) -> None:
    """One key, one limit — so a 429 on one prompt is the whole client's news.

    Backing off only the prompt that was refused would leave every other prompt hammering an
    endpoint that has already said no, and the `/v1` limit is per API key rather than per prompt.
    """
    clock = Clock()
    other = "pr_99887766"
    routes = refused("300")
    routes[f"v1/marker/{other}"] = HttpResponse(status=200, headers={}, body="{}")
    http = FakeHttp(routes)
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    assert len(http.urls) == 1

    client.refresh(other)
    assert len(http.urls) == 1, "a second prompt asked anyway after the client was refused"


def test_a_429_with_no_retry_after_still_waits(clients: list[fortyone.Client]) -> None:
    """Reading a missing header as "come back immediately" would make the unluckiest the loudest."""
    clock = Clock()
    http = FakeHttp(refused(None))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    clock.advance(DEFAULT_RETRY_AFTER_SECONDS - 1)
    client.refresh(PROMPT_ID)
    assert len(http.urls) == 1, http.urls

    clock.advance(2)
    client.refresh(PROMPT_ID)
    assert len(http.urls) == 2, http.urls


def test_an_unreadable_retry_after_falls_back_rather_than_crashing(clients: list[fortyone.Client]) -> None:
    """An HTTP-date is legal in `Retry-After` and needs a clock this module does not have.

    Rule 8 is the point: a header we cannot parse must not become an exception, and it must not
    become zero either.
    """
    clock = Clock()
    http = FakeHttp(refused("Wed, 21 Oct 2026 07:28:00 GMT"))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    clock.advance(DEFAULT_RETRY_AFTER_SECONDS - 1)
    client.refresh(PROMPT_ID)
    assert len(http.urls) == 1, http.urls


def test_a_hostile_retry_after_cannot_retire_the_client_for_ever(clients: list[fortyone.Client]) -> None:
    """A server saying "a year" gets one day. Otherwise one bad header is a permanent outage."""
    clock = Clock()
    http = FakeHttp(refused("31536000"))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    clock.advance(24 * 60 * 60 + 1)
    client.refresh(PROMPT_ID)
    assert len(http.urls) == 2, http.urls


def test_the_warning_says_what_happened_and_keeps_the_frozen_code(clients: list[fortyone.Client]) -> None:
    """No new `WarningCode`.

    ADR-006 section 1 freezes the TypeScript surface and `test_divergence.py` holds the two in
    parity, so a code that existed in one language and not the other would be a divergence bought
    for a branch a caller can already make on the message.
    """
    seen: list[Any] = []
    clock = Clock()
    http = FakeHttp(refused("30"))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=seen.append)

    client.refresh(PROMPT_ID)

    assert len(seen) == 1
    assert seen[0].code == "network"
    assert "429" in seen[0].message
    assert "rate limited" in seen[0].message


def test_resolve_keeps_answering_from_memory_while_the_client_is_refused(
    clients: list[fortyone.Client],
) -> None:
    """The limit must never cost a customer a prompt. Rule 8 and the whole point of the SDK."""
    clock = Clock()
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT, version=6))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, now=clock, on_warning=lambda _: None)

    client.refresh(PROMPT_ID)
    assert client.resolve(PROMPT_ID, {"company": "N"}).status == "ok"

    http.routes = refused("600")
    clock.advance(31)
    client.refresh(PROMPT_ID)

    answer = client.resolve(PROMPT_ID, {"company": "N"})
    assert answer.status == "ok"
    assert answer.version == 6
    assert answer.source == "memory"
