# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Zero dependencies, typed, and the alias distribution (EPIC-054 C3, C13).

The roadmap's Tasks line names the mechanism for the first claim — *"zero dependencies (tested via
``importlib.metadata``)"* — and the wheel is built here for the rest, because what ships is what a
customer installs and the source tree is not that. `uv build` takes under a second with a warm
cache.
"""

from __future__ import annotations

import pathlib
import subprocess
import tomllib
import zipfile
from importlib import metadata

import pytest

HERE = pathlib.Path(__file__).resolve().parent
PACKAGE = HERE.parent
ALIAS = PACKAGE.parent / "python-alias"


def _manifest(directory: pathlib.Path) -> dict[str, object]:
    return tomllib.loads((directory / "pyproject.toml").read_text(encoding="utf-8"))


def test_the_distribution_declares_no_dependency() -> None:
    required = metadata.requires("fortyone-prompts")
    assert not required, f"fortyone-prompts declares {required}"


def test_the_dependency_check_can_see_a_dependency() -> None:
    """The positive control.

    ``metadata.requires`` returns ``None`` for a distribution with none **and** for one it cannot
    find, so the assertion above passes just as well against a typo. `pytest` has dependencies.
    """
    assert metadata.requires("pytest")


def test_nothing_outside_the_standard_library_is_imported() -> None:
    """The second half of the same claim, read off the source rather than the metadata.

    A manifest can be right while the code imports something a developer happened to have installed;
    this reads every ``import`` in the package and checks the module against the interpreter's own
    list of standard-library names.
    """
    import ast
    import sys

    outside: set[str] = set()
    for source in sorted((PACKAGE / "fortyone").glob("*.py")):
        tree = ast.parse(source.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                outside.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                outside.add(node.module.split(".")[0])
    outside -= set(sys.stdlib_module_names)
    assert outside == set(), f"{sorted(outside)} is not in the standard library"


def test_the_version_matches_the_manifest() -> None:
    import fortyone

    assert fortyone.__version__ == _manifest(PACKAGE)["project"]["version"]  # type: ignore[index]


@pytest.fixture(scope="session")
def wheel(tmp_path_factory: pytest.TempPathFactory) -> pathlib.Path:
    out = tmp_path_factory.mktemp("wheel")
    subprocess.run(["uv", "build", "--wheel", "--out-dir", str(out)], cwd=PACKAGE, check=True, capture_output=True)
    built = sorted(out.glob("*.whl"))
    assert len(built) == 1, built
    return built[0]


def test_py_typed_is_in_the_wheel(wheel: pathlib.Path) -> None:
    """PEP 561's marker, in the thing a customer installs.

    Ruling 1: this package is typed by its own annotations and ships no ``.pyi``, because a stub file
    *overrides* the module it shadows and a stale one silently wins. Without this file in the wheel,
    a customer's `mypy` ignores the package entirely and the annotations buy them nothing.
    """
    names = zipfile.ZipFile(wheel).namelist()
    assert "fortyone/py.typed" in names
    assert not [name for name in names if name.endswith(".pyi")], "ruling 1: no stub files"


def test_the_wheel_carries_the_licence_and_the_notice(wheel: pathlib.Path) -> None:
    names = zipfile.ZipFile(wheel).namelist()
    assert any(name.endswith("licenses/LICENSE") for name in names)
    assert any(name.endswith("licenses/NOTICE") for name in names)


def test_every_module_in_the_package_ships(wheel: pathlib.Path) -> None:
    shipped = {name for name in zipfile.ZipFile(wheel).namelist() if name.endswith(".py")}
    on_disk = {f"fortyone/{path.name}" for path in (PACKAGE / "fortyone").glob("*.py")}
    assert on_disk == shipped


def test_the_alias_distribution_is_a_name_and_a_dependency() -> None:
    manifest = _manifest(ALIAS)
    project = manifest["project"]
    assert isinstance(project, dict)
    assert project["name"] == "41prompts"
    assert project["dependencies"] == [f"fortyone-prompts=={project['version']}"]
    # It ships no module of its own: two distributions installing one `fortyone/` is how a machine
    # ends up with two copies and no rule about which wins.
    assert not (ALIAS / "fortyone").exists()


def test_the_alias_version_tracks_the_package_it_aliases() -> None:
    assert _manifest(ALIAS)["project"]["version"] == _manifest(PACKAGE)["project"]["version"]  # type: ignore[index]


def test_the_alias_builds_and_contains_no_module(tmp_path: pathlib.Path) -> None:
    subprocess.run(["uv", "build", "--wheel", "--out-dir", str(tmp_path)], cwd=ALIAS, check=True, capture_output=True)
    built = sorted(tmp_path.glob("*.whl"))
    assert len(built) == 1, built
    names = zipfile.ZipFile(built[0]).namelist()
    assert not [name for name in names if name.endswith(".py")], names


def test_neither_manifest_points_at_a_repository_that_does_not_exist_yet() -> None:
    """EPIC-056 creates `41prompts/41prompts` and re-points every URL in the same change.

    An empty placeholder repository reads as abandoned to a stranger and a private one reads as
    unreleased, which is what we are. Until the mirror is real these point at the private
    repository — Soroush's ruling of 2026-09-11, and it applies to a `pyproject.toml` exactly as it
    applies to a `package.json`.
    """
    for directory in (PACKAGE, ALIAS):
        urls = _manifest(directory)["project"]["urls"]  # type: ignore[index]
        assert isinstance(urls, dict)
        for url in urls.values():
            assert "41prompts/41prompts" not in url, f"{directory.name}: {url}"
            assert url.startswith("https://github.com/soroushamdg/41prompts")
