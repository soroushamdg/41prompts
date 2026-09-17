# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""The divergence table is complete (EPIC-054 C16) — the roadmap's Review line.

*"Divergence table vs TypeScript"*, and a table written once is a table that is wrong within an
epic. So the names are read out of `packages/sdk-ts`'s own source and each one is required to appear
in `README.md`'s table.

**Why read the TypeScript rather than list the names here.** A list in this file is a third copy of
the surface ADR-006 froze, and it would go stale in exactly the way the table it is guarding would.
Reading `index.ts` and `types.ts` means adding an export over there fails over here, which is the
only arrangement that keeps a document honest.

Both paths survive `scripts/mirror-dry-run.sh`'s filter, which keeps `packages/sdk-ts` and
`sdks/python` together — EPIC-053's failure #1 was a test reading a path the mirror does not have.
"""

from __future__ import annotations

import pathlib
import re

import pytest

HERE = pathlib.Path(__file__).resolve().parent
SDK_TS = HERE.parent.parent.parent / "packages" / "sdk-ts" / "src"
README = (HERE.parent / "README.md").read_text(encoding="utf-8")

TABLE = README[README.index("## Divergences from") :]


def _source(name: str) -> str:
    path = SDK_TS / name
    if not path.exists():  # pragma: no cover - a moved path is a tree problem, not a test one
        raise AssertionError(f"{path} is not there; this test reads the TypeScript surface at source")
    return path.read_text(encoding="utf-8")


def _exported_types() -> list[str]:
    block = re.search(r"export type \{([^}]*)\}", _source("index.ts"))
    assert block is not None, "index.ts no longer has a `export type { ... }` block"
    return sorted(name.strip() for name in block.group(1).split(",") if name.strip())


def _exported_values() -> list[str]:
    block = re.search(r"export \{([^}]*)\} from", _source("index.ts"))
    assert block is not None, "index.ts no longer has a value export block"
    return sorted(name.strip() for name in block.group(1).split(",") if name.strip())


def _members_of(interface: str) -> list[str]:
    source = _source("types.ts")
    body = re.search(rf"export interface {interface} \{{(.*?)\n\}}", source, re.S)
    assert body is not None, f"{interface} is no longer an interface in types.ts"
    return sorted(set(re.findall(r"^\s*readonly (\w+)", body.group(1), re.M)))


@pytest.mark.parametrize("name", _exported_values() + _exported_types())
def test_every_frozen_export_has_a_row(name: str) -> None:
    assert f"`{name}`" in TABLE, f"ADR-006 freezes {name} and the divergence table does not mention it"


@pytest.mark.parametrize("name", _members_of("ClientOptions"))
def test_every_client_option_has_a_row(name: str) -> None:
    assert f"`{name}`" in TABLE, f"ClientOptions.{name} is not in the divergence table"


@pytest.mark.parametrize("name", _members_of("ResolveResult"))
def test_every_result_field_has_a_row(name: str) -> None:
    assert f"`{name}`" in TABLE, f"ResolveResult.{name} is not in the divergence table"


def test_the_check_can_fail() -> None:
    """The positive control.

    Every assertion above is an "appears in the document" test, and those pass against a document
    containing everything — including one that had accidentally been replaced by the TypeScript
    source itself. This names something the surface does not have.
    """
    assert "`createClientImmediately`" not in TABLE


def test_the_surface_being_read_is_not_empty() -> None:
    # The other half of the control: a regex that stopped matching would make every parametrized
    # test above vanish, and a suite with no tests in it is green.
    assert len(_exported_values()) == 3
    assert len(_exported_types()) == 9
    assert len(_members_of("ResolveResult")) >= 9


def test_every_python_public_name_is_in_the_table_too() -> None:
    """The table is read in both directions, so it cannot describe a surface we do not have."""
    import fortyone

    for name in fortyone.__all__:
        assert f"`{name}`" in TABLE, f"fortyone.{name} is not in the divergence table"
