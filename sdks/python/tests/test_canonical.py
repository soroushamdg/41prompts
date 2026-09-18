# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""The canonical encoding agrees with `packages/core`, byte for byte (EPIC-054 C4).

`canonical_golden.json` is what core's encoder actually produced, recorded by
`node scripts/write-canonical-golden.mjs`. The comparison starts from JSON **text**, so it covers
the whole path from bytes to bytes and not merely the formatter in the middle: a parser that turned
`1` into something else would fail here too.
"""

from __future__ import annotations

import json

import pytest

from fortyone._canonical import CanonicalError, canonical_json, js_number, sha256_text
from tests._support import GOLDEN


def test_every_golden_case_matches_core() -> None:
    mismatches = []
    for entry in GOLDEN["entries"]:
        value = json.loads(entry["input"])
        produced = canonical_json(value)
        if produced != entry["canonical"]:
            mismatches.append((entry["input"], entry["canonical"], produced))
    assert mismatches == [], f"{len(mismatches)} of {GOLDEN['cases']} cases disagree with packages/core"


def test_the_golden_is_large_enough_to_be_evidence() -> None:
    # A golden of four cases would pass while the formatter was wrong about everything else. The
    # generator emits the hand-picked edge cases plus 240 seeded random doubles.
    assert GOLDEN["cases"] > 300


def test_the_comparison_can_fail() -> None:
    # The positive control. Without it, an encoder that returned the golden's own text would pass.
    assert canonical_json({"n": 1.0}) == "{\"n\":1}"
    assert canonical_json({"n": 1.0}) != "{\"n\":1.0}"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1.0, "1"),
        (-0.0, "0"),
        (1e15, "1000000000000000"),
        (1e16, "10000000000000000"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (1e-6, "0.000001"),
        (1e-7, "1e-7"),
        (5e-324, "5e-324"),
        (2**53, "9007199254740992"),
    ],
)
def test_numbers_are_ecma_262(value: float, expected: str) -> None:
    """Every clause of ECMA-262 Number::toString, one case each."""
    assert js_number(value) == expected


@pytest.mark.parametrize(
    ("value", "python_would_say"),
    [
        (1.0, "1.0"),
        (-0.0, "-0.0"),
        (1e15, "1000000000000000.0"),
        (1e16, "1e+16"),
        (1e20, "1e+20"),
        (1e-6, "1e-06"),
        (1e-7, "1e-07"),
    ],
)
def test_pythons_own_rendering_would_have_broken_verification(value: float, python_would_say: str) -> None:
    """The seven cases where `json.dumps` and `JSON.stringify` disagree.

    Each one is a build that would hash two ways — and the symptom is `hash_mismatch` on every
    document, which reads as *somebody served you the wrong one*. Not every case in the table above
    diverges (`1e+21` and `5e-324` happen to agree); these are the ones that do, which is why the
    claim is made about them and not about all ten.
    """
    assert json.dumps(value) == python_would_say
    assert js_number(value) != python_would_say


def test_keys_sort_by_utf16_code_unit_not_code_point() -> None:
    # U+1F680 is a surrogate pair, so in UTF-16 it sorts as 0xD83D — before U+F900. A code-point
    # sort puts it after. `canonical.ts` sorts JavaScript strings, which is the former.
    produced = canonical_json({"豈": 1, "\U0001f680": 2})
    assert produced.index("\U0001f680") < produced.index("豈")


def test_a_lone_surrogate_is_escaped_rather_than_encoded() -> None:
    # `json.dumps(..., ensure_ascii=False)` emits the character, and encoding it as UTF-8 raises.
    produced = canonical_json({"s": "\ud800"})
    assert produced == '{"s":"\\ud800"}'
    assert sha256_text(produced)  # it encodes, which is the point


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_numbers_are_refused_rather_than_becoming_null(value: float) -> None:
    with pytest.raises(CanonicalError):
        canonical_json({"n": value})


def test_an_integer_too_large_for_a_double_is_refused() -> None:
    # JavaScript's parser would have produced Infinity, which has no JSON form either.
    with pytest.raises(CanonicalError):
        canonical_json({"n": 10**400})


def test_a_cycle_is_refused_and_a_shared_reference_is_not() -> None:
    shared: dict[str, int] = {"a": 1}
    assert canonical_json([shared, shared]) == '[{"a":1},{"a":1}]'

    cycle: dict[str, object] = {}
    cycle["self"] = cycle
    with pytest.raises(CanonicalError):
        canonical_json(cycle)


def test_a_value_with_no_json_form_is_refused_by_name() -> None:
    with pytest.raises(CanonicalError) as failure:
        canonical_json({"when": object()})
    assert "when" in str(failure.value)


def test_sha256_is_over_utf8_bytes() -> None:
    # The published FIPS 180-4 vector, so the digest is pinned to the standard and not to hashlib.
    assert sha256_text("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
