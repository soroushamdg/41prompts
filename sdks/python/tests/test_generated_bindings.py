# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""The generated bindings type-check against the real runtime (EPIC-054 C10).

The roadmap's Tests line: *"`mypy --strict` on generated bindings"*. EPIC-053 checked the golden
against EPIC-000's stub, which had two fields and always returned `unavailable`; this checks it
against the module that now stands underneath it, which is a different claim and the one that
matters to somebody who runs `41p pull --lang python`.

The golden is `packages/cli/src/__goldens__/prompts.py.txt`, read where it lives rather than copied.
It survives `scripts/mirror-dry-run.sh`'s filter along with this directory.
"""

from __future__ import annotations

import pathlib
import subprocess

import pytest

HERE = pathlib.Path(__file__).resolve().parent
PACKAGE = HERE.parent
ROOT = PACKAGE.parent.parent
GOLDEN = ROOT / "packages" / "cli" / "src" / "__goldens__" / "prompts.py.txt"


def type_check(directory: pathlib.Path) -> subprocess.CompletedProcess[str]:
    """`mypy --strict` over a directory, with `fortyone` importable from this package.

    Run through `uv run --with mypy` so no type checker is installed into this project: `mypy` is a
    development tool for this one criterion, not a dependency of a package whose whole claim is that
    it has none.
    """
    return subprocess.run(
        [
            "uv", "run", "--with", "mypy", "--project", str(PACKAGE),
            "mypy", "--strict", "--no-incremental", "--cache-dir", str(directory / ".mypy"), str(directory),
        ],
        cwd=PACKAGE,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture
def generated(tmp_path: pathlib.Path) -> pathlib.Path:
    assert GOLDEN.exists(), f"{GOLDEN} is not there; 41p pull's golden moved"
    (tmp_path / "prompts.py").write_text(GOLDEN.read_text(encoding="utf-8"), encoding="utf-8")
    return tmp_path


def test_the_generated_file_passes_mypy_strict(generated: pathlib.Path) -> None:
    done = type_check(generated)
    assert done.returncode == 0, done.stdout + done.stderr


def test_the_check_would_notice_a_wrong_argument_type(generated: pathlib.Path) -> None:
    """The negative control.

    Without it, a `mypy` invocation that silently checked nothing — a wrong path, a missing file, an
    `--exclude` that swallowed the directory — would pass the test above and report the criterion as
    met. This calls a generated function with an `int` where it wants a `str`.
    """
    (generated / "caller.py").write_text(
        "from prompts import refund_classifier\n\nrefund_classifier(customer_name=1, email='a@b.c')\n",
        encoding="utf-8",
    )
    done = type_check(generated)
    assert done.returncode != 0
    assert "customer_name" in done.stdout


def test_a_correct_caller_still_passes(generated: pathlib.Path) -> None:
    """And the control on the control: the failure above is about the argument, not about the file.

    A `caller.py` that `mypy` refused for any other reason would make the negative control pass for
    the wrong reason, which is the shape lesson 21 is about.
    """
    (generated / "caller.py").write_text(
        "from prompts import daily_summary, refund_classifier\n"
        "\n"
        "a = refund_classifier(customer_name='Ada', email='a@b.c')\n"
        "b = daily_summary()\n"
        "print(a.status, b.text)\n",
        encoding="utf-8",
    )
    done = type_check(generated)
    assert done.returncode == 0, done.stdout + done.stderr


def test_the_result_is_read_by_attribute_and_not_by_key(generated: pathlib.Path) -> None:
    """Ruling 2, checked where it shows: in the code a customer writes against the generated file.

    A `TypedDict` would have made this `result["status"]`, which reads nothing like the TypeScript
    SDK's `result.status`. Subscripting a frozen dataclass is a type error, and that is the assertion.
    """
    (generated / "caller.py").write_text(
        "from prompts import daily_summary\n\nprint(daily_summary()['status'])\n",
        encoding="utf-8",
    )
    done = type_check(generated)
    assert done.returncode != 0
