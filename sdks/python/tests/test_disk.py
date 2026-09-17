# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""The disk cache, and the half of the cross-language check that lives here (EPIC-054 C9).

`packages/sdk-ts/src/disk.test.ts` holds the other half: it reads a record written by *this* file
and writes one for this file to read. The two are committed under
`tests/cross-language/` so neither suite has to run the other's language, and each one fails if the
format moves underneath it.
"""

from __future__ import annotations

import json
import os
import pathlib

import pytest

from fortyone._disk import Entry, default_cache_dir, install_id, read_from_disk, write_to_disk
from fortyone._types import SdkWarning
from tests._support import BUILD, BUILD_TEXT, PROMPT_ID

CROSS = pathlib.Path(__file__).resolve().parent / "cross-language"


def collect() -> tuple[list[SdkWarning], object]:
    seen: list[SdkWarning] = []
    return seen, seen.append


def test_a_record_written_here_reads_back(tmp_path: pathlib.Path) -> None:
    warnings, warn = collect()
    entry = Entry(build=BUILD, version=6, published_at="2026-09-16T14:03:07Z", etag='"tag"')
    write_to_disk(str(tmp_path), PROMPT_ID, entry, BUILD_TEXT, warn)  # type: ignore[arg-type]

    read = read_from_disk(str(tmp_path), PROMPT_ID, warn)  # type: ignore[arg-type]
    assert read is not None
    assert read.version == 6 and read.etag == '"tag"'
    assert read.build["buildHash"] == BUILD["buildHash"]
    assert warnings == []


def test_the_record_typescript_wrote_is_read_here() -> None:
    """The cross-language check, direction one.

    `cross-language/written-by-typescript.json` is produced by `@41prompts/sdk`'s own
    `writeToDisk`, committed, and read here with nothing adapted. If either side changes the record
    shape, this fails rather than the two silently keeping separate caches in one directory.
    """
    warnings, warn = collect()
    directory = CROSS
    read = read_from_disk(str(directory), "written-by-typescript", warn)  # type: ignore[arg-type]
    assert read is not None, warnings
    assert read.version == 6
    assert read.published_at == "2026-09-16T14:03:07Z"
    assert read.etag == '"from-typescript"'
    assert read.build["buildHash"] == BUILD["buildHash"]


def test_the_record_this_writes_is_the_shape_typescript_reads(tmp_path: pathlib.Path) -> None:
    """Direction two, asserted here as well as over there.

    `disk.test.ts` reads `cross-language/written-by-python.json`; this proves the file it reads is
    the file this code actually produces, so the committed fixture cannot drift away from the writer
    while still satisfying the reader.
    """
    _, warn = collect()
    entry = Entry(build=BUILD, version=6, published_at="2026-09-16T14:03:07Z", etag='"from-python"')
    write_to_disk(str(tmp_path), "written-by-python", entry, BUILD_TEXT, warn)  # type: ignore[arg-type]

    produced = json.loads((tmp_path / "written-by-python.json").read_text(encoding="utf-8"))
    committed = json.loads((CROSS / "written-by-python.json").read_text(encoding="utf-8"))
    assert produced == committed


@pytest.mark.parametrize(
    "prompt_id",
    ["../escape", "a/b", "..", "/absolute", "with space", "x" * 100, "", "a\x00b"],
)
def test_an_unsafe_id_never_becomes_a_path(tmp_path: pathlib.Path, prompt_id: str) -> None:
    _, warn = collect()
    write_to_disk(str(tmp_path), prompt_id, Entry(BUILD, 1, None, None), BUILD_TEXT, warn)  # type: ignore[arg-type]
    assert list(tmp_path.iterdir()) == []
    assert read_from_disk(str(tmp_path), prompt_id, warn) is None  # type: ignore[arg-type]


def test_a_safe_id_does_become_a_path(tmp_path: pathlib.Path) -> None:
    # The positive control for the test above: without it, a writer that wrote nothing at all would
    # pass every one of those cases.
    _, warn = collect()
    write_to_disk(str(tmp_path), PROMPT_ID, Entry(BUILD, 1, None, None), BUILD_TEXT, warn)  # type: ignore[arg-type]
    assert [path.name for path in tmp_path.iterdir()] == [f"{PROMPT_ID}.json"]


def test_a_corrupt_file_is_a_warning_and_not_a_crash(tmp_path: pathlib.Path) -> None:
    warnings, warn = collect()
    (tmp_path / f"{PROMPT_ID}.json").write_text("{not json", encoding="utf-8")
    assert read_from_disk(str(tmp_path), PROMPT_ID, warn) is None  # type: ignore[arg-type]
    assert [w.code for w in warnings] == ["disk"]


def test_a_file_from_another_shape_is_refused(tmp_path: pathlib.Path) -> None:
    warnings, warn = collect()
    (tmp_path / f"{PROMPT_ID}.json").write_text(json.dumps({"cacheVersion": 99}), encoding="utf-8")
    assert read_from_disk(str(tmp_path), PROMPT_ID, warn) is None  # type: ignore[arg-type]
    assert [w.code for w in warnings] == ["disk"]


def test_a_cached_build_is_re_verified_on_the_way_out(tmp_path: pathlib.Path) -> None:
    """A file on disk is not ours in any sense that matters.

    Another process, another version of this package, or a person with an editor can have changed
    it — so it is checked against its own content address rather than trusted because we wrote it.
    """
    warnings, warn = collect()
    tampered = BUILD_TEXT.replace("at most 80 words", "at most 99 words")
    record = {"cacheVersion": 1, "version": 6, "publishedAt": None, "etag": None, "artifact": tampered}
    (tmp_path / f"{PROMPT_ID}.json").write_text(json.dumps(record), encoding="utf-8")

    assert read_from_disk(str(tmp_path), PROMPT_ID, warn) is None  # type: ignore[arg-type]
    assert [w.code for w in warnings] == ["hash_mismatch"]


def test_a_missing_file_is_not_worth_a_warning(tmp_path: pathlib.Path) -> None:
    warnings, warn = collect()
    assert read_from_disk(str(tmp_path), PROMPT_ID, warn) is None  # type: ignore[arg-type]
    assert warnings == [], "a cold start is the normal case"


def test_the_write_leaves_no_temporary_file_behind(tmp_path: pathlib.Path) -> None:
    _, warn = collect()
    write_to_disk(str(tmp_path), PROMPT_ID, Entry(BUILD, 1, None, None), BUILD_TEXT, warn)  # type: ignore[arg-type]
    assert [p.name for p in tmp_path.iterdir()] == [f"{PROMPT_ID}.json"]


def test_a_write_that_cannot_happen_is_a_warning(tmp_path: pathlib.Path) -> None:
    warnings, warn = collect()
    blocked = tmp_path / "file"
    blocked.write_text("not a directory", encoding="utf-8")
    write_to_disk(str(blocked / "under"), PROMPT_ID, Entry(BUILD, 1, None, None), BUILD_TEXT, warn)  # type: ignore[arg-type]
    assert [w.code for w in warnings] == ["disk"]


def test_the_default_directory_is_the_one_the_typescript_sdk_uses() -> None:
    # Ruling 5. The name is the contract; `packages/sdk-ts/src/disk.ts` exports the same constant.
    assert os.path.basename(default_cache_dir()) == "41prompts-sdk"


def test_the_install_id_is_random_and_sticks(tmp_path: pathlib.Path) -> None:
    first = install_id(str(tmp_path))
    assert first is not None and len(first) == 36
    assert install_id(str(tmp_path)) == first
    # Derived from nothing: not a hostname, not a MAC address, not an environment variable.
    assert first != install_id(str(tmp_path / "elsewhere"))


def test_no_install_id_where_nothing_can_be_written(tmp_path: pathlib.Path) -> None:
    blocked = tmp_path / "file"
    blocked.write_text("not a directory", encoding="utf-8")
    assert install_id(str(blocked / "under")) is None
