# SPDX-FileCopyrightText: 2026 <legal entity>
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

__all__ = ["CACHE_DIR_NAME", "Entry", "default_cache_dir", "install_id", "read_from_disk", "write_to_disk"]

# Conservative on purpose: a superset of the id format, and a subset of what a filename may be.
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

CACHE_DIR_NAME = "41prompts-sdk"


def default_cache_dir() -> str:
    return os.path.join(tempfile.gettempdir(), CACHE_DIR_NAME)


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
        os.makedirs(directory, exist_ok=True)
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
        os.makedirs(directory, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(created)
        return created
    except OSError:
        return None
