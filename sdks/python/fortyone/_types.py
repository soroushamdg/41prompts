# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""The published shapes of ``fortyone`` (EPIC-054).

The counterpart of ``packages/sdk-ts/src/types.ts``, and ADR-006 §1's frozen surface read into
Python. Where a name differs, the difference is in ``README.md``'s divergence table with its reason;
``tests/test_divergence.py`` fails when a name is added here and not written down there.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal

__all__ = ["ResolveResult", "ResolveSource", "SdkWarning", "WarningCode", "WarningHandler"]

WarningCode = Literal[
    # No key, or no base URL, so the background refresh cannot run at all.
    "not_configured",
    # The request did not complete: offline, DNS, TLS, timeout, connection refused.
    "network",
    # The key was refused (401) or is scoped to another project (403).
    "unauthorised",
    # The prompt is unknown, or nothing has ever been published for it (404).
    "not_found",
    # A response arrived and was not the document it claimed to be.
    "malformed",
    # `schemaVersion` names a format this reader was written before. ADR-005 section 3.
    "unknown_version",
    # The build does not hash to the address it was fetched under, or to the one that is Live.
    "hash_mismatch",
    # The disk cache could not be read or written. Never fatal; memory and bundled still work.
    "disk",
    # `resolve()` was called without a value for a variable that has no default.
    "missing_variables",
]

# Where the answer came from. Never "network": the network fills the first two and is never in the
# call path. See `Client.resolve`.
ResolveSource = Literal["memory", "disk", "bundled", "none"]


@dataclass(frozen=True)
class SdkWarning:
    """Something went wrong and the call did not raise.

    ``CLAUDE.md`` rule 8: this package never raises. Every failure that would have been an exception
    arrives here instead, and ``message`` is written to be readable in a log with no other context
    around it.

    **It is ``SdkWarning`` and not ``Warning``**, which is the one name in this module that is not a
    transliteration. ``Warning`` is a built-in exception base class, and a package that shadows it
    changes what ``except Warning:`` means in any module that does ``from fortyone import *``. The
    divergence table carries the row.
    """

    code: WarningCode
    message: str
    # The prompt the warning is about, where there is one.
    prompt_id: str | None = None


WarningHandler = Callable[[SdkWarning], None]


@dataclass(frozen=True)
class ResolveResult:
    """What a ``resolve()`` call returns. Always this shape, whatever went wrong.

    ``status`` is the one field a caller must read. ``"unavailable"`` means ``text`` is ``""`` and
    sending it to a model would send an empty prompt — it is never a degraded answer to be used
    anyway.

    **A frozen dataclass rather than a ``TypedDict``** (EPIC-054 ruling 2), so it is read with
    ``result.status`` exactly as its TypeScript counterpart is, and cannot be mutated by the code
    that receives it.
    """

    status: Literal["ok", "unavailable"]
    # The compiled prompt with variables bound, or "" when `status` is "unavailable".
    text: str
    source: ResolveSource
    prompt_id: str
    # The N a person reads as "Live vN", or None when nothing was resolved.
    version: int | None
    # The build's content address, or None.
    build_hash: str | None
    # The model the checks were proved against — not a model you must use. None when unresolved.
    model: str | None
    # Declared variables with no supplied value and no default. Empty when `status` is "ok".
    missing: tuple[str, ...] = field(default=())
    # Declared variables that fell back to their default, in the order they appear in the text.
    used_defaults: tuple[str, ...] = field(default=())
