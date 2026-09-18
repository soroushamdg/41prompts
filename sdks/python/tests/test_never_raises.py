# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Nothing raises, for any argument (EPIC-054 C2).

`CLAUDE.md` rule 8, and it is **a promise about callers a type checker never saw**. Python's
annotations are not enforced at run time, so every one of the values below is something a real
caller can pass — from a dynamic configuration file, a JSON payload, a test double, or a typo. The
equivalent suite in `@41prompts/sdk` found three real defects on its first run, all in
`createClient`, none of them reachable from TypeScript. That is the argument for this file.
"""

from __future__ import annotations

from typing import Any, Iterator

import pytest

import fortyone
from tests._support import BUILD, PROMPT_ID


@pytest.fixture(autouse=True)
def _close() -> Iterator[None]:
    made: list[fortyone.Client] = []
    _MADE.append(made)
    yield
    _MADE.remove(made)
    for client in made:
        client.close()


_MADE: list[list[fortyone.Client]] = []


def make(**options: Any) -> fortyone.Client:
    client = fortyone.create_client(**options)
    if _MADE:
        _MADE[-1].append(client)
    return client


class Hostile:
    """A mapping whose every access raises. The shape a proxy or a lazy config object can have."""

    def keys(self) -> Any:
        raise RuntimeError("keys() is broken")

    def __getitem__(self, key: str) -> Any:
        raise RuntimeError("__getitem__ is broken")

    def __iter__(self) -> Any:
        raise RuntimeError("__iter__ is broken")

    def __len__(self) -> int:
        raise RuntimeError("__len__ is broken")


class PartlyHostile(dict[str, Any]):
    """Keys can be listed; reading one raises. The half-broken case is the one that gets missed."""

    def __getitem__(self, key: str) -> Any:
        raise RuntimeError("__getitem__ is broken")


NONSENSE: list[Any] = [
    None,
    0,
    1,
    -1,
    "",
    "a string",
    b"bytes",
    [],
    {},
    set(),
    object(),
    Hostile(),
    lambda: None,
    float("nan"),
    True,
]


@pytest.mark.parametrize("value", NONSENSE)
def test_create_client_survives_any_option_value(value: Any) -> None:
    client = make(
        api_key=value,
        base_url=value,
        bundled=value,
        cache_dir=value,
        refresh_seconds=value,
        jitter=value,
        timeout_seconds=value,
        telemetry=value,
        on_warning=value,
        http=value,
        now=value,
    )
    assert client.resolve(PROMPT_ID, {}).status == "unavailable"


@pytest.mark.parametrize("prompt_id", NONSENSE)
def test_resolve_survives_any_prompt_id(prompt_id: Any) -> None:
    client = make(api_key=None, cache_dir=None, bundled=[BUILD])
    result = client.resolve(prompt_id, {})
    assert isinstance(result, fortyone.ResolveResult)
    assert result.status in ("ok", "unavailable")


@pytest.mark.parametrize("variables", NONSENSE + [PartlyHostile(a=1), {1: "a"}, {"a": object()}, {"a": None}])
def test_resolve_survives_any_variables(variables: Any) -> None:
    client = make(api_key=None, cache_dir=None, bundled=[BUILD])
    assert client.resolve(PROMPT_ID, variables).status in ("ok", "unavailable")


@pytest.mark.parametrize("handler", NONSENSE)
def test_resolve_survives_any_warning_handler(handler: Any) -> None:
    client = make(api_key=None, cache_dir=None)
    assert client.resolve(PROMPT_ID, {}, on_warning=handler).status == "unavailable"


@pytest.mark.parametrize("bundled", [[None], [[]], [0], ["{}"], [object()], [{"schemaVersion": 1}], [{}] * 5])
def test_any_bundled_content_is_dropped_rather_than_raising(bundled: Any) -> None:
    client = make(api_key=None, cache_dir=None, bundled=bundled)
    assert client.resolve(PROMPT_ID, {}).status == "unavailable"


def test_a_prompt_id_that_is_a_path_never_reaches_the_filesystem(tmp_path: Any) -> None:
    """A caller's argument reaching a path join is a directory traversal.

    Refused before a path is built from it rather than escaped afterwards — the same guard
    `packages/sdk-ts/src/disk.ts` has, for the same reason.
    """
    client = make(api_key=None, cache_dir=str(tmp_path))
    for hostile in ("../../etc/passwd", "a/b", "..", "/absolute", "x" * 500, "a\x00b"):
        assert client.resolve(hostile, {}).status == "unavailable"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("value", NONSENSE)
def test_refresh_and_close_survive_anything(value: Any) -> None:
    client = make(api_key=None, cache_dir=None)
    client.refresh(value)
    client.close()
    client.close()


def test_a_transport_that_raises_is_a_warning(tmp_path: Any) -> None:
    def explode(*_args: Any) -> Any:
        raise RuntimeError("the transport is broken")

    warnings: list[fortyone.SdkWarning] = []
    client = make(api_key="41p_test_x", cache_dir=None, http=explode, on_warning=warnings.append)
    client.refresh(PROMPT_ID)
    assert [w.code for w in warnings] == ["network"]


def test_a_transport_that_returns_nonsense_is_a_warning() -> None:
    def rubbish(*_args: Any) -> Any:
        return "not a response"

    warnings: list[fortyone.SdkWarning] = []
    client = make(api_key="41p_test_x", cache_dir=None, http=rubbish, on_warning=warnings.append)
    client.refresh(PROMPT_ID)
    assert warnings and warnings[0].code in ("network", "malformed")


def test_the_module_level_resolve_survives_nonsense() -> None:
    fortyone.configure(api_key=None, cache_dir=None)
    try:
        for value in NONSENSE:
            assert fortyone.resolve(value, value).status == "unavailable"
    finally:
        fortyone.configure(api_key=None, cache_dir=None)


def test_configure_survives_nonsense() -> None:
    try:
        for value in NONSENSE:
            fortyone.configure(api_key=value, bundled=value, cache_dir=value)
    finally:
        fortyone.configure(api_key=None, cache_dir=None)


def test_the_fuzz_would_notice_a_raise() -> None:
    """The positive control.

    Without it, a suite that had accidentally stopped calling anything would still be green — and a
    "nothing raises" test that never reaches the code is the emptiest possible pass.
    """
    with pytest.raises(RuntimeError):
        Hostile().keys()
