# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Variable binding is `packages/core`'s rules, with its three traps intact (EPIC-054 C8)."""

from __future__ import annotations

import pytest

from fortyone._bind import bind_variables, occurrences_in_text

REQUIRED = [{"name": "name", "defaultValue": None, "description": None}]
OPTIONAL = [{"name": "tone", "defaultValue": "warm", "description": None}]
EMPTY_DEFAULT = [{"name": "extra", "defaultValue": "", "description": None}]


def test_a_value_is_inserted_and_never_rescanned() -> None:
    """Trap one. A support transcript containing `{{other}}` stays a transcript.

    Substituting into an inserted value would turn a customer's own words into a binding, which is
    the failure `bind.ts` describes and the reason replacement is computed from the original text.
    """
    bound = bind_variables("Hello {{name}}.", {"name": "{{other}}"}, REQUIRED)
    assert bound.ok
    assert bound.text == "Hello {{other}}."


def test_a_long_value_does_not_shift_a_later_substitution() -> None:
    """Trap two. Right to left, so every offset is still valid when it is used."""
    bound = bind_variables(
        "{{a}} and {{b}}",
        {"a": "x" * 500, "b": "second"},
        [
            {"name": "a", "defaultValue": None, "description": None},
            {"name": "b", "defaultValue": None, "description": None},
        ],
    )
    assert bound.ok
    assert bound.text == f"{'x' * 500} and second"


def test_an_empty_string_is_a_real_default() -> None:
    """Trap three. "nobody supplied this" and "somebody supplied nothing" are different facts."""
    bound = bind_variables("a{{extra}}b", {}, EMPTY_DEFAULT)
    assert bound.ok
    assert bound.text == "ab"
    assert bound.used_defaults == ("extra",)


def test_a_missing_required_name_refuses_rather_than_shipping_the_braces() -> None:
    bound = bind_variables("Hello {{name}}.", {}, REQUIRED)
    assert not bound.ok
    assert bound.missing == ("name",)
    # The whole point: the text is not handed back with a hole in it.
    assert bound.text == ""


def test_a_supplied_value_wins_over_a_default() -> None:
    bound = bind_variables("Be {{tone}}.", {"tone": "brisk"}, OPTIONAL)
    assert bound.ok and bound.text == "Be brisk." and bound.used_defaults == ()


def test_every_occurrence_of_one_name_is_substituted_and_reported_once() -> None:
    bound = bind_variables("{{tone}} {{tone}} {{tone}}", {}, OPTIONAL)
    assert bound.ok and bound.text == "warm warm warm"
    assert bound.used_defaults == ("tone",)


def test_missing_names_are_reported_in_reading_order_without_repeats() -> None:
    declarations = [{"name": n, "defaultValue": None, "description": None} for n in ("b", "a")]
    bound = bind_variables("{{b}} {{a}} {{b}}", {}, declarations)
    assert bound.missing == ("b", "a")


@pytest.mark.parametrize(
    ("text", "names"),
    [
        ("{{name}}", ["name"]),
        ("{{ name }}", ["name"]),
        ("{{\tname\n}}", ["name"]),
        # A leading digit is not a name, a dash is not a name, and an empty brace form is not one.
        ("{{2fa}} {{a-b}} {{}}", []),
        ("{{_private}} {{a1}}", ["_private", "a1"]),
    ],
)
def test_the_name_syntax_is_cores(text: str, names: list[str]) -> None:
    assert [found.name for found in occurrences_in_text(text)] == names


@pytest.mark.parametrize(
    ("character", "is_whitespace_in_javascript"),
    [
        ("﻿", True),   # JavaScript's \s matches it; Python's does not.
        (" ", True),
        (" ", True),
        ("", False),  # Python's \s matches it; JavaScript's does not.
        ("", False),
    ],
)
def test_the_whitespace_class_is_javascripts_and_not_pythons(character: str, is_whitespace_in_javascript: bool) -> None:
    """The quietest available divergence, closed by spelling the class out.

    Leaving `\\s` in the pattern would make `{{<char>name}}` a variable in one language and not the
    other for these five characters — so the two SDKs would send different prompts from the same
    build, and nothing would report it.
    """
    found = occurrences_in_text("{{" + character + "name}}")
    assert (len(found) == 1) is is_whitespace_in_javascript


def test_binding_is_correct_around_characters_outside_the_basic_plane() -> None:
    """Core's offsets are UTF-16 code units and these are code points.

    That difference is invisible as long as the offsets are only ever used to slice the string they
    were measured in, which is the whole of what this module does with them. An emoji before the
    placeholder is where a mixed-up offset would show.
    """
    bound = bind_variables("\U0001f680\U0001f680 {{name}} \U0001f680", {"name": "Ada"}, REQUIRED)
    assert bound.ok
    assert bound.text == "\U0001f680\U0001f680 Ada \U0001f680"


def test_a_prompt_with_no_variables_binds_to_itself() -> None:
    bound = bind_variables("no variables here", {}, [])
    assert bound.ok and bound.text == "no variables here" and bound.used_defaults == ()


def test_a_declaration_that_is_never_used_changes_nothing() -> None:
    # Declared-but-unused is a real state: the build carries the contract whether or not the text
    # exercises it, and `isCompatible` reads the declaration rather than the text.
    bound = bind_variables("nothing", {}, OPTIONAL)
    assert bound.ok and bound.used_defaults == ()
