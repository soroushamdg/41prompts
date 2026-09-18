# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""Offline (EPIC-054 C6) — the roadmap's own Tests line.

Three shapes of "there is no network", and the thing that matters is that all three answer rather
than raise. The failure this guards against is an application that starts fine in a data centre and
cannot start at all on an aeroplane, in a locked-down CI job, or during our outage — which is the
one sentence this product sells.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any, Iterator, Mapping

import pytest

import fortyone
from fortyone._network import HttpResponse
from tests._support import BUILD, BUILD_TEXT, PROMPT_ID


def unreachable(_url: str, _headers: Mapping[str, str], _timeout: float) -> HttpResponse:
    """What a socket does when nothing is listening. `urllib` raises; so does this."""
    raise OSError("[Errno 61] Connection refused")


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


def test_a_bundled_build_answers_with_no_network_at_all(clients: list[fortyone.Client]) -> None:
    warnings: list[fortyone.SdkWarning] = []
    client = make(
        clients,
        api_key="41p_test_x",
        cache_dir=None,
        bundled=[BUILD],
        http=unreachable,
        on_warning=warnings.append,
    )
    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.status == "ok" and result.source == "bundled"


def test_a_warm_disk_cache_answers_with_no_network_at_all(
    clients: list[fortyone.Client], tmp_path: pathlib.Path
) -> None:
    # Written the way the SDK writes it, so this is the restart case and not a special path.
    record = {"cacheVersion": 1, "version": 6, "publishedAt": "2026-09-16T14:03:07Z", "etag": None, "artifact": BUILD_TEXT}
    (tmp_path / f"{PROMPT_ID}.json").write_text(json.dumps(record), encoding="utf-8")

    client = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path), http=unreachable)
    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.status == "ok"
    assert result.source == "disk"
    assert result.version == 6


def test_neither_is_unavailable_with_a_reason_and_no_exception(clients: list[fortyone.Client]) -> None:
    warnings: list[fortyone.SdkWarning] = []
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=unreachable, on_warning=warnings.append)
    result = client.resolve(PROMPT_ID, {"company": "Northwind"})
    assert result.status == "unavailable"
    assert result.text == ""
    assert result.source == "none"
    client.refresh(PROMPT_ID)
    assert "network" in [warning.code for warning in warnings]


def test_refresh_with_no_network_returns_rather_than_raising(clients: list[fortyone.Client]) -> None:
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=unreachable)
    client.refresh(PROMPT_ID)
    client.refresh()


def test_a_client_with_no_key_warns_once_and_keeps_working(clients: list[fortyone.Client]) -> None:
    warnings: list[fortyone.SdkWarning] = []
    client = make(clients, api_key=None, cache_dir=None, bundled=[BUILD], on_warning=warnings.append)
    for _ in range(3):
        assert client.resolve(PROMPT_ID, {"company": "N"}).status == "ok"
    client.refresh(PROMPT_ID)
    client.refresh(PROMPT_ID)
    unconfigured = [warning for warning in warnings if warning.code == "not_configured"]
    assert len(unconfigured) == 1, "a missing key must be said once, not once a call"
    assert "FORTYONE_API_KEY" in unconfigured[0].message


def test_a_bad_bundled_entry_is_dropped_and_its_neighbours_are_not(clients: list[fortyone.Client]) -> None:
    warnings: list[fortyone.SdkWarning] = []
    client = make(
        clients,
        api_key=None,
        cache_dir=None,
        bundled=[{"schemaVersion": 1, "nonsense": True}, BUILD],
        on_warning=warnings.append,
    )
    assert client.resolve(PROMPT_ID, {"company": "N"}).status == "ok"
    assert any("bundled build 1 was dropped" in warning.message for warning in warnings)


def test_bundled_that_is_not_a_list_is_ignored_with_a_warning(clients: list[fortyone.Client]) -> None:
    warnings: list[fortyone.SdkWarning] = []
    # A mapping and a string are both things a caller reaches for, and guessing at either would be a
    # guess about what is in a customer's prompt.
    make(clients, api_key=None, cache_dir=None, bundled={"a": BUILD}, on_warning=warnings.append)
    make(clients, api_key=None, cache_dir=None, bundled="[]", on_warning=warnings.append)
    assert len([w for w in warnings if w.code == "malformed"]) == 2


def test_a_cache_directory_that_cannot_be_written_is_a_warning_not_a_failure(
    clients: list[fortyone.Client], tmp_path: pathlib.Path
) -> None:
    blocked = tmp_path / "not-a-directory"
    blocked.write_text("this is a file", encoding="utf-8")
    client = make(clients, api_key=None, cache_dir=str(blocked / "under"), bundled=[BUILD])
    assert client.resolve(PROMPT_ID, {"company": "N"}).status == "ok"
