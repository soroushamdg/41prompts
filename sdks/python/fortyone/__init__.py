# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

from typing import Callable, Optional, TypedDict


class ResolveResult(TypedDict):
    text: str
    status: str


def resolve(
    prompt_id: str,
    vars: Optional[dict] = None,
    on_warning: Optional[Callable[[str], None]] = None,
) -> ResolveResult:
    """Stub for EPIC-000. Never raises: reports unavailability through the
    result and the optional on_warning callback instead (CLAUDE.md rule 8)."""
    if on_warning is not None:
        on_warning("not implemented")
    return {"text": "", "status": "unavailable"}
