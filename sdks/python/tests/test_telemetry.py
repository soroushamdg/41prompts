# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Telemetry is off, and when it is on it sends nothing of its own (EPIC-054 C12).

`CLAUDE.md` rule 8's third sentence. The claim being tested is not "there is a flag" — it is that
turning the flag on **adds a header to a request that was already happening** and does not cause a
request that would not otherwise have been made. So every test here counts requests as well as
reading headers.
"""

from __future__ import annotations

import pathlib
import re
from typing import Any, Iterator

import pytest

import fortyone
from tests._support import BUILD, BUILD_TEXT, FakeHttp, PROMPT_ID, live_routes


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


def test_off_by_default(clients: list[fortyone.Client], tmp_path: pathlib.Path) -> None:
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path), http=http)
    client.refresh(PROMPT_ID)

    assert http.calls, "nothing was requested, so this asserts nothing"
    for _url, headers in http.calls:
        assert "41p-client" not in headers
    # And no install id was created, because nothing needed one.
    assert not (tmp_path / "install-id").exists()


def test_on_it_rides_a_request_that_was_happening_anyway(
    clients: list[fortyone.Client], tmp_path: pathlib.Path
) -> None:
    quiet = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    loud = FakeHttp(live_routes(BUILD, BUILD_TEXT))

    off = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path / "off"), http=quiet)
    on = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path / "on"), http=loud, telemetry=True)
    off.refresh(PROMPT_ID)
    on.refresh(PROMPT_ID)

    # The same requests, to the same URLs, in the same number. Only a header differs.
    assert loud.urls == quiet.urls
    header = loud.header_for(f"v1/marker/{PROMPT_ID}", "41p-client")
    assert header is not None


def test_the_header_names_four_things_and_no_more(clients: list[fortyone.Client], tmp_path: pathlib.Path) -> None:
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path), http=http, telemetry=True)
    client.refresh(PROMPT_ID)

    header = http.header_for(f"v1/marker/{PROMPT_ID}", "41p-client")
    assert header is not None
    # language / package version / runtime / install id. The TypeScript SDK sends the same four in
    # the same order with `ts` in front; `README.md`'s divergence table carries the row.
    assert re.fullmatch(r"py/\d+\.\d+\.\d+/python3\d+/[0-9a-f-]{36}", header), header


def test_the_install_id_identifies_nothing_but_itself(
    clients: list[fortyone.Client], tmp_path: pathlib.Path
) -> None:
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path), http=http, telemetry=True)
    client.refresh(PROMPT_ID)

    identity = (tmp_path / "install-id").read_text(encoding="utf-8").strip()
    header = http.header_for(f"v1/marker/{PROMPT_ID}", "41p-client")
    assert header is not None and header.endswith(identity)

    # A random UUID in a file a person can delete — not a hostname, not a user name, not an
    # environment variable, nothing that identifies a machine or an account.
    import getpass
    import os
    import socket

    for revealing in (socket.gethostname(), getpass.getuser(), os.getcwd()):
        assert revealing.lower() not in identity.lower()


def test_with_no_writable_directory_the_header_goes_without_an_id(clients: list[fortyone.Client]) -> None:
    http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
    client = make(clients, api_key="41p_test_x", cache_dir=None, http=http, telemetry=True)
    client.refresh(PROMPT_ID)

    header = http.header_for(f"v1/marker/{PROMPT_ID}", "41p-client")
    assert header is not None and header.endswith("/anonymous")


def test_a_value_that_is_not_true_leaves_it_off(clients: list[fortyone.Client], tmp_path: pathlib.Path) -> None:
    # `telemetry=1` and `telemetry="yes"` are things a caller writes, and neither is consent.
    for value in (1, "yes", [], object()):
        http = FakeHttp(live_routes(BUILD, BUILD_TEXT))
        client = make(clients, api_key="41p_test_x", cache_dir=str(tmp_path), http=http, telemetry=value)
        client.refresh(PROMPT_ID)
        assert http.header_for(f"v1/marker/{PROMPT_ID}", "41p-client") is None, value
