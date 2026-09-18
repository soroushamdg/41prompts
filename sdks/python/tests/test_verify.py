# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Reading a document somebody else served us (EPIC-054 C5).

The fixture is `packages/core`'s frozen v1 build — written by the publisher's own code path, not by
hand — so a change in core's encoding fails here rather than quietly agreeing with a copy.
"""

from __future__ import annotations

import json

import pytest

from fortyone._verify import check_build, read_build, read_marker
from tests._support import BUILD, BUILD_HASH, BUILD_TEXT, MARKER_TEXT, PROMPT_ID


def test_the_frozen_build_verifies_against_its_own_address() -> None:
    read = read_build(BUILD_TEXT)
    assert read.ok, read.warning
    assert read.value is not None
    assert read.value["buildHash"] == BUILD_HASH


def test_it_also_verifies_against_the_marker_that_names_it() -> None:
    marker = read_marker(MARKER_TEXT)
    assert marker.ok and marker.value is not None
    assert marker.value["promptId"] == PROMPT_ID
    assert read_build(BUILD_TEXT, marker.value["buildHash"]).ok


@pytest.mark.parametrize(
    "tamper",
    [
        # A character inside a blok's text.
        lambda text: text.replace("at most 80 words", "at most 90 words"),
        # A parameter's value, which is inside the address: ADR-005 puts `model`, `params` and
        # `checkSuiteId` in the hash so that two publishes proved differently are two builds.
        lambda text: text.replace('"maxOutputTokens":1024', '"maxOutputTokens":2048'),
        # A field removed.
        lambda text: text.replace('"checkSuiteId":"srun_3f7b1e08c4d29a65",', ""),
    ],
)
def test_a_changed_byte_is_refused(tamper: object) -> None:
    changed = tamper(BUILD_TEXT)  # type: ignore[operator]
    assert changed != BUILD_TEXT, "the tamper did not change anything, so this asserts nothing"
    read = read_build(changed)
    assert not read.ok
    assert read.warning is not None
    assert read.warning.code in ("hash_mismatch", "malformed")


def test_an_intact_build_that_is_not_the_one_that_is_live_is_refused() -> None:
    read = read_build(BUILD_TEXT, "0" * 64)
    assert not read.ok and read.warning is not None
    assert read.warning.code == "hash_mismatch"
    assert "not the one the Live marker names" in read.warning.message


def test_a_bundled_document_needs_no_marker() -> None:
    # Check 1 still runs on it; there is no newer thing on this machine to compare it against.
    assert check_build(BUILD).ok


def test_a_future_format_is_refused_by_version_before_anything_else_is_read() -> None:
    future = json.dumps({"schemaVersion": 99})
    read = read_build(future)
    assert not read.ok and read.warning is not None
    assert read.warning.code == "unknown_version"
    assert "upgrade fortyone-prompts" in read.warning.message


@pytest.mark.parametrize(
    "text",
    ["", "not json", "[]", '"a string"', "null", '{"schemaVersion":1}'],
)
def test_a_document_that_is_not_one_is_refused_rather_than_raising(text: str) -> None:
    read = read_build(text)
    assert not read.ok and read.warning is not None


def test_a_marker_naming_a_different_format_is_refused() -> None:
    read = read_marker(json.dumps({"schemaVersion": 2, "promptId": "pr_x", "buildHash": "a", "version": 1, "publishedAt": "x"}))
    assert not read.ok and read.warning is not None
    assert read.warning.code == "unknown_version"


def test_a_marker_version_may_arrive_as_a_float() -> None:
    # TypeScript sees one number type and both `6` and `6.0` pass its check. Python sees two, and
    # refusing the second would make the SDKs disagree about a document neither of them wrote.
    read = read_marker(json.dumps({"schemaVersion": 1, "promptId": "pr_x", "buildHash": "a", "version": 6.0, "publishedAt": "x"}))
    assert read.ok and read.value is not None
    assert read.value["version"] == 6
    assert isinstance(read.value["version"], int)


def test_a_marker_version_that_is_not_a_whole_number_is_refused() -> None:
    read = read_marker(json.dumps({"schemaVersion": 1, "promptId": "pr_x", "buildHash": "a", "version": 6.5, "publishedAt": "x"}))
    assert not read.ok


def test_a_value_that_cannot_be_hashed_is_a_warning_and_not_an_exception() -> None:
    # Only reachable from `bundled`, where a caller hands us Python objects rather than parsed JSON.
    read = check_build({**BUILD, "params": {"t": object()}})
    assert not read.ok and read.warning is not None
    assert read.warning.code in ("malformed", "hash_mismatch")


def test_insignificant_whitespace_does_not_change_the_address() -> None:
    """The property the canonical encoding exists for, asserted rather than assumed.

    The hash is over the document's *value*, re-encoded canonically, not over the bytes that
    arrived. So a server that pretty-printed its JSON still serves a verifiable document — and a
    reader that hashed the received bytes instead would reject it. This is the first thing that was
    wrong in the artifact format's v0, and it is why `canonical.ts` exists.
    """
    reformatted = json.dumps(json.loads(BUILD_TEXT), indent=2, ensure_ascii=True)
    assert reformatted != BUILD_TEXT
    assert read_build(reformatted, BUILD_HASH).ok
