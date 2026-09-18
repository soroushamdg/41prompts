# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""Reading a document somebody else served us (EPIC-054).

The counterpart of ``packages/sdk-ts/src/verify.ts``, and the argument is the same one:

**Nothing here trusts a byte.** A build arrives over HTTP from a CDN with no session in front of it.
ADR-005 section 1 says that is deliberate — anything in a build is public — and the consequence is
that this module is the only thing standing between a wrong document and a prompt sent to a model.
So it checks the format version first, then the content address, and only then reads a field.

**The hash is the structural check.** Re-deriving the address from the document's own body through
the same canonical encoding the publisher used means a document with a field added, a field missing,
a character changed or a number reformatted does not produce the same address. A match is a much
stronger statement than any field-by-field validation, and it is one a reader in another language
can make the same way — which is the whole reason this file exists. The ``isinstance`` checks below
cover only the case the hash cannot: a document that has never been hashed at all, where a wrong
shape would otherwise reach an iteration.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

from ._canonical import CanonicalError, canonical_json, sha256_text
from ._types import SdkWarning, WarningCode

__all__ = ["BUILD_SCHEMA_VERSION", "MARKER_SCHEMA_VERSION", "Read", "check_build", "read_build", "read_marker"]

# The two formats have two clocks. `packages/core/src/artifact/schema.ts` says why: a marker is five
# small fields that change for different reasons and on a different schedule from the document it
# names, and one shared number would force a bump on both whenever either moved.
BUILD_SCHEMA_VERSION = 1
MARKER_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class Read:
    """Either a document or the warning that says why there is not one."""

    ok: bool
    value: Mapping[str, Any] | None = None
    warning: SdkWarning | None = None


def _bad(code: WarningCode, message: str, prompt_id: str | None = None) -> Read:
    return Read(ok=False, warning=SdkWarning(code=code, message=message, prompt_id=prompt_id))


def _parse(text: str) -> Read:
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        return _bad("malformed", "the response was not JSON")
    if not isinstance(value, dict):
        return _bad("malformed", "the response was not an object")
    return Read(ok=True, value=value)


def read_marker(text: str) -> Read:
    """Read a Live marker.

    Refuses a ``schemaVersion`` it was written before, per ADR-005 section 3 — which here means a
    warning and a fallback rather than an exception, because rule 8 says this package never raises.
    """
    parsed = _parse(text)
    if not parsed.ok:
        return parsed
    document = parsed.value
    assert document is not None

    if document.get("schemaVersion") != MARKER_SCHEMA_VERSION:
        return _bad(
            "unknown_version",
            f"the Live marker is format {document.get('schemaVersion')!r} and this SDK reads "
            f"{MARKER_SCHEMA_VERSION}; upgrade fortyone-prompts",
        )
    if not isinstance(document.get("promptId"), str) or not isinstance(document.get("buildHash"), str):
        return _bad("malformed", "the Live marker is missing promptId or buildHash")
    # TypeScript asks only `typeof === "number"`, and JSON's `6` and `6.0` are one value there. In
    # Python they are an `int` and a `float`, so both are accepted and an integral float is narrowed
    # rather than refused — the alternative is the two SDKs disagreeing about a document neither of
    # them wrote.
    version = document.get("version")
    if isinstance(version, bool) or not isinstance(version, (int, float)) or version != int(version):
        return _bad("malformed", "the Live marker is missing version or publishedAt")
    if not isinstance(document.get("publishedAt"), str):
        return _bad("malformed", "the Live marker is missing version or publishedAt")
    document = {**document, "version": int(version)}
    return Read(ok=True, value=document)


def read_build(text: str, expected_hash: str | None = None) -> Read:
    """Read a build document, and prove it is the one that is Live.

    Two checks, and the roadmap's *"artifact sha verified against pointer"* is both of them:

    1. **The document hashes to its own address.** Catches corruption and tampering.
    2. **That address is the one the marker named.** Catches a document that is intact and is not
       the one that is Live — a stale CDN edge, a cache holding a real object from last week, a
       bucket prefix serving another environment's builds. A correct document for the wrong moment
       is the failure nobody would otherwise notice, because everything about it looks right.

    ``expected_hash`` is optional because a **bundled** document has no marker to be checked
    against: it was shipped with the application by whoever built it, and there is nothing newer to
    compare it to. Check 1 still runs on it.
    """
    parsed = _parse(text)
    if not parsed.ok:
        return parsed
    assert parsed.value is not None
    return check_build(parsed.value, expected_hash)


def check_build(document: Any, expected_hash: str | None = None) -> Read:
    """The same checks against an already-parsed value — what ``bundled`` holds."""
    if not isinstance(document, dict):
        return _bad("malformed", "the build was not an object")

    if document.get("schemaVersion") != BUILD_SCHEMA_VERSION:
        return _bad(
            "unknown_version",
            f"the build is format {document.get('schemaVersion')!r} and this SDK reads "
            f"{BUILD_SCHEMA_VERSION}; upgrade fortyone-prompts",
        )
    if not isinstance(document.get("buildHash"), str) or not isinstance(document.get("text"), str):
        return _bad("malformed", "the build is missing buildHash or text")
    if not isinstance(document.get("variables"), list) or not isinstance(document.get("promptId"), str):
        return _bad("malformed", "the build is missing promptId or variables")

    prompt_id = document["promptId"]
    body = {key: value for key, value in document.items() if key != "buildHash"}
    try:
        derived = sha256_text(canonical_json(body))
    except CanonicalError:
        # The canonical encoder refuses a value with no canonical form. Parsed JSON always has one,
        # so this is only reachable from `bundled`, where a caller may hand us any object at all.
        return _bad("malformed", "the build holds a value that cannot be hashed", prompt_id)

    if derived != document["buildHash"]:
        return _bad("hash_mismatch", "the build does not match its own content address", prompt_id)
    if expected_hash is not None and document["buildHash"] != expected_hash:
        return _bad("hash_mismatch", "the build is intact but is not the one the Live marker names", prompt_id)
    return Read(ok=True, value=document)
