# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Binding a caller's values into a compiled prompt.

A port of ``packages/core/src/inputs/bind.ts`` and the occurrence scanner it uses,
``variables/extract.ts``. The three traps below are each a defect this project met before they
became rules, and each one is preserved here rather than rediscovered:

**A value is inserted verbatim and is never rescanned.** Replacement is computed from the offsets of
the *original* text and applied right to left, so every offset is still valid when it is used and
nothing a value contains can be read as a placeholder. A support transcript that happens to contain
``{{name}}`` would otherwise be substituted into, turning a customer's words into a binding. Left to
right would be wrong for a second reason as well: a value longer than its placeholder shifts every
later offset, so the second substitution would land in the middle of the first.

**A missing required name refuses rather than empties.** An empty string is a real value — a
variable declared with a default of ``""`` is a real declaration — so "nobody supplied this" and
"somebody supplied nothing" cannot share a representation, and the first one refuses. The
alternative is sending ``{{customer_name}}`` to a model, which produces a plausible answer about a
customer called "customer_name": wrong, at a rate nobody notices for a week.

**The whitespace class is written out, because the two regex engines disagree about it.** JavaScript
matches U+FEFF and does not match U+001C–U+001F or U+0085; Python's ``\\s`` is the other way round.
Leaving it as ``\\s`` would make ``{{ name }}`` parse differently in the two languages for some
inputs, which is the quietest possible divergence in a package whose whole job is to agree.

**Offsets here are code points, and core's are UTF-16 code units.** That is not a defect and needs
no conversion: the offsets are used only to slice the same Python string they were measured in, and
the resulting text is identical. Nothing in this module exposes an offset.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

__all__ = ["Occurrence", "bind_variables", "declared_default", "occurrences_in_text"]

# ECMA-262's `WhiteSpace` and `LineTerminator` production, spelled out. See the module docstring.
_JS_SPACE = (
    "\t\n\f\r             "
    "     　﻿"
)
_SPACE_CLASS = "[" + "".join(f"\\u{ord(c):04x}" for c in _JS_SPACE) + "]"

# `{{` · optional whitespace · name · optional whitespace · `}}`. The name may not start with a
# digit and holds no spaces, dots or dashes — `[A-Za-z_][A-Za-z0-9_]*`, ASCII by construction in
# both languages. Whitespace inside the braces is tolerated because the product already writes it
# that way, which is evidence about the intended syntax rather than a guess.
_PATTERN = re.compile(
    r"\{\{(" + _SPACE_CLASS + r"*)([A-Za-z_][A-Za-z0-9_]*)" + _SPACE_CLASS + r"*\}\}"
)


@dataclass(frozen=True)
class Occurrence:
    """One ``{{name}}`` written somewhere in the compiled prompt."""

    name: str
    start: int
    end: int


def occurrences_in_text(text: str) -> list[Occurrence]:
    """Every brace form in one string, in document order."""
    return [Occurrence(name=found.group(2), start=found.start(), end=found.end()) for found in _PATTERN.finditer(text)]


def declared_default(declaration: Mapping[str, Any]) -> str | None:
    """The declared default, or ``None`` when the caller must supply a value.

    A variable need not be supplied exactly when it has a default to fall back on. ``optional`` is
    not a field in the format and must not become one: two fields could contradict each other, and
    then something has to decide which of them is the truth.
    """
    value = declaration.get("defaultValue")
    return value if isinstance(value, str) else None


@dataclass(frozen=True)
class Bound:
    """The outcome of a binding. ``ok`` false means ``missing`` names why."""

    ok: bool
    text: str
    used_defaults: tuple[str, ...]
    missing: tuple[str, ...]


def bind_variables(
    text: str,
    values: Mapping[str, str],
    declarations: Sequence[Mapping[str, Any]],
) -> Bound:
    """Substitute one set of values into one compiled prompt."""
    defaults: dict[str, str] = {}
    for declaration in declarations:
        name = declaration.get("name")
        default = declared_default(declaration)
        if isinstance(name, str) and default is not None:
            defaults[name] = default

    found = occurrences_in_text(text)

    missing: list[str] = []
    used_defaults: list[str] = []
    seen_missing: set[str] = set()
    seen_defaulted: set[str] = set()

    for occurrence in found:
        if occurrence.name in values:
            continue
        if occurrence.name in defaults:
            if occurrence.name not in seen_defaulted:
                seen_defaulted.add(occurrence.name)
                used_defaults.append(occurrence.name)
            continue
        if occurrence.name not in seen_missing:
            seen_missing.add(occurrence.name)
            missing.append(occurrence.name)

    if missing:
        return Bound(ok=False, text="", used_defaults=(), missing=tuple(missing))

    out = text
    for occurrence in reversed(found):
        value = values.get(occurrence.name, defaults.get(occurrence.name))
        if value is None:
            continue
        out = out[: occurrence.start] + value + out[occurrence.end :]

    return Bound(ok=True, text=out, used_defaults=tuple(used_defaults), missing=())
