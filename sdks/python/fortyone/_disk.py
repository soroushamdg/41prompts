# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""The disk cache (EPIC-054).

The second source in ``CLAUDE.md`` rule 8's order, and the one that makes a **restart** cheap: a
process that has been up for a week holds everything in memory, and a process that started four
seconds ago holds nothing. Without this, every deploy would serve its first requests from the
bundled document — or from nothing.

**It is the same format and the same directory as** ``@41prompts/sdk``'s (EPIC-054 ruling 5), so a
container running a Node service and a Python worker shares one warm cache — and, more usefully, so
that a record written by one and read by the other is a test the two cannot pass while disagreeing.
``tests/test_disk.py`` and ``packages/sdk-ts/src/disk.test.ts`` each read a record the other wrote.

**Everything here is best effort and nothing here raises.** A read-only filesystem, a container with
no writable temp directory, a full disk, a file another process is halfway through writing: all of
them are normal, none of them is fatal, and each one degrades to a warning and an in-memory cache.

**The write is atomic**, to a temporary name in the same directory and then renamed, so a reader
sees either the old file or the new one and never half of one. That also makes the refresh thread
safe to kill: it is a daemon (ruling 6), so the interpreter can exit while it is writing, and what
is left behind is a temporary file rather than a corrupt cache.

**A prompt id is not a path.** ``prompt_id`` reaches this module from a caller's argument, and a
caller's argument reaching ``join`` is a directory traversal. Ids are ``pr_`` plus eight hex, so
anything that is not plainly a file-safe name is refused before a path is built from it rather than
escaped afterwards.

**The directory has to be ours, because a content address is not a signature (EPIC-057).**

Above, this module says a file on disk "is not ours in any sense that matters" and re-verifies the
content address on the way out. *That proves the document is intact. It does not prove it is ours.*
``build_hash`` is a SHA-256 of the document's own canonical encoding, so anyone who can write into
this directory can write any text they like, compute its ``build_hash`` themselves, and hand us a
document that passes every check this package makes — ``prompt_id`` included, since they choose that
too. The result is a prompt of a stranger's writing sent to a customer's model, with no warning
anywhere. It is prompt injection with no model involved, delivered through a file.

Measured on 2026-09-17, both platforms:

- **Linux**: ``tempfile.gettempdir()`` is ``/tmp``, mode ``1777``. World-writable and sticky. The
  sticky bit stops another user *deleting* our directory once it exists; it does nothing to stop
  them **creating it first**, and whoever creates it sets its mode.
- **macOS**: it is a per-user ``/var/folders/.../T`` at mode ``700``, so the cache already sits
  inside a private directory there. The exposure is a Linux and container one, which is where this
  ships.
- ``os.makedirs(mode=0o700)`` **does nothing to a directory that already exists** — an
  attacker-created ``0777`` stays ``0777``, and the mode is masked by the umask even when it does
  not. So the mode argument is not the control; the ``os.stat`` afterwards is.

So the directory is created ``0o700`` *and* checked before it is read: not owned by this user, or
writable by group or other, and the cache is refused with a ``disk`` warning. Memory and bundled are
untouched, which is what makes failing closed here safe.

**What this does not fix.** A process running as the same user can still write the cache, and that
is inherent — it is our own uid. Only a signature makes a document *ours* rather than merely intact,
and that is a key, a distribution mechanism and a format version.
``docs/security/sdk-threat-model.md`` finding 3 carries the row.

**``@41prompts/sdk`` does not have this check**, and that is a divergence in *security posture*
rather than in naming — the one kind this project would rather not have. EPIC-057 ruling 11 has the
four measurements: the check costs 290 bytes minified and ADR-006's 15 KB budget had 239 to spare.
It is stated in ``sdks/python/README.md``'s divergence table rather than smoothed over.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from typing import Any, Mapping

from ._types import SdkWarning, WarningHandler
from ._verify import read_build

__all__ = [
    "CACHE_DIR_NAME",
    "Entry",
    "cache_dir_refusal",
    "default_cache_dir",
    "install_id",
    "read_from_disk",
    "write_to_disk",
]

# Conservative on purpose: a superset of the id format, and a subset of what a filename may be.
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

CACHE_DIR_NAME = "41prompts-sdk"


def default_cache_dir() -> str:
    return os.path.join(tempfile.gettempdir(), CACHE_DIR_NAME)


# Owner only. Masked by the umask on creation and ignored entirely when the directory already
# exists, which is the case that matters; ``cache_dir_refusal`` is the control.
_OWNER_ONLY = 0o700


def cache_dir_refusal(directory: str) -> str | None:
    """Why this cache directory cannot be trusted, or ``None`` when it can (EPIC-057).

    A sentence rather than a boolean, because a customer reading "writable by other users" can act
    on it and "the cache was ignored" cannot be acted on at all. Python has no bundle budget to pay
    for that, which is the one place this package is allowed to be more generous than its
    TypeScript counterpart.

    **Windows has no** ``os.getuid`` **and no POSIX mode bits**, so there is nothing to check and
    the answer is ``None`` — a check that cannot run must not read as a check that passed, which is
    why the module docstring names the platforms this covers.

    A directory that is not there yet is fine: there is nothing in it to have been substituted, and
    the ordinary read path already treats a missing file as a cold start.
    """
    getuid = getattr(os, "getuid", None)
    if getuid is None:
        return None

    try:
        stats = os.stat(directory)
    except OSError:
        return None

    if stats.st_uid != getuid():
        return f"the cache directory {directory} is owned by another user"
    # Group or other write. Owner-write is the point of the directory.
    if stats.st_mode & 0o022:
        return f"the cache directory {directory} is writable by other users"
    return None


@dataclass(frozen=True)
class Entry:
    """What this SDK holds for one prompt: a build, and the marker facts that came with it.

    The two are kept together because they were true together. ``version`` is the N a person reads
    as "Live v7" and it lives on the **marker**, not on the build — a build is immutable and the
    same bytes can be Live twice with two different numbers in front of them.

    The consequence, which surfaces to a caller: a **bundled** build has no marker, so its
    ``version`` is ``None``. That is honest rather than unfortunate. Whoever ran ``41p pull`` knows
    which version they bundled; the document itself does not, and inventing a number here would be
    the SDK asserting something nobody told it.
    """

    build: Mapping[str, Any]
    version: int | None
    published_at: str | None
    etag: str | None


def _file_for(directory: str, prompt_id: str) -> str | None:
    if not _SAFE_ID.match(prompt_id):
        return None
    return os.path.join(directory, f"{prompt_id}.json")


def read_from_disk(directory: str, prompt_id: str, warn: WarningHandler) -> Entry | None:
    """Read one prompt's cached entry.

    The build is stored as the **text** it arrived as and re-verified on the way out, rather than as
    a nested object trusted because we wrote it. A file on disk is not ours in any sense that
    matters: another process, another version of this package, another language's SDK, or a person
    with an editor can have changed it, and re-deriving the content address costs microseconds.
    """
    path = _file_for(directory, prompt_id)
    if path is None:
        return None

    # Before a byte is read. A document out of a directory somebody else can write is a document
    # somebody else chose, and it will hash correctly because they hashed it. See the docstring.
    refusal = cache_dir_refusal(directory)
    if refusal is not None:
        warn(SdkWarning("disk", f"{refusal}; the cache is being ignored", prompt_id))
        return None

    try:
        with open(path, encoding="utf-8") as handle:
            raw = handle.read()
    except OSError:
        # Missing is the normal case on a cold start and is not worth a warning.
        return None

    try:
        record = json.loads(raw)
    except ValueError:
        warn(SdkWarning("disk", "the cached file was not JSON; it is being ignored", prompt_id))
        return None
    if not isinstance(record, dict) or record.get("cacheVersion") != 1 or not isinstance(record.get("artifact"), str):
        warn(SdkWarning("disk", "the cached file is not a shape this SDK wrote", prompt_id))
        return None

    read = read_build(record["artifact"])
    if not read.ok:
        assert read.warning is not None
        warn(SdkWarning(read.warning.code, f"the cached build was rejected: {read.warning.message}", prompt_id))
        return None

    assert read.value is not None
    version = record.get("version")
    published_at = record.get("publishedAt")
    etag = record.get("etag")
    return Entry(
        build=read.value,
        version=version if isinstance(version, int) and not isinstance(version, bool) else None,
        published_at=published_at if isinstance(published_at, str) else None,
        etag=etag if isinstance(etag, str) else None,
    )


def write_to_disk(directory: str, prompt_id: str, entry: Entry, build_text: str, warn: WarningHandler) -> None:
    """Write one prompt's entry. ``build_text`` is the bytes as they arrived, not a re-serialisation.

    The record's key is ``artifact`` because that is the key ``@41prompts/sdk`` already writes and
    this file is a reader of it as much as a writer. Renaming it would end the sharing that ruling 5
    exists for, and the word is a type name in the format rather than a string anybody reads.
    """
    path = _file_for(directory, prompt_id)
    if path is None:
        return

    record = {
        "cacheVersion": 1,
        "version": entry.version,
        "publishedAt": entry.published_at,
        "etag": entry.etag,
        "artifact": build_text,
    }

    temporary = f"{path}.{uuid.uuid4()}.tmp"
    try:
        os.makedirs(directory, mode=_OWNER_ONLY, exist_ok=True)
        with open(temporary, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(record))
        os.replace(temporary, path)
    except OSError as failure:
        try:
            os.unlink(temporary)
        except OSError:
            # Nothing to do about a temporary file we could not remove, and it must not mask the
            # warning that says the cache is not working.
            pass
        warn(SdkWarning("disk", f"the cache could not be written: {failure}", prompt_id))


def install_id(directory: str) -> str | None:
    """The install id for the telemetry header, created on first use and derived from nothing.

    A random UUID in a file a person can delete — not a hostname, not a MAC address, not an
    environment variable, nothing that identifies a machine or an account to anybody who has not
    already been told. When there is no writable directory there is no install id and the header
    goes without one, which is the right failure: telemetry is the least important thing this
    package does.
    """
    path = os.path.join(directory, "install-id")
    try:
        with open(path, encoding="utf-8") as handle:
            existing = handle.read().strip()
        if _SAFE_ID.match(existing):
            return existing
    except OSError:
        pass  # Not there yet.

    created = str(uuid.uuid4())
    try:
        os.makedirs(directory, mode=_OWNER_ONLY, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(created)
        return created
    except OSError:
        return None
