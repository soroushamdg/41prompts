# SPDX-FileCopyrightText: 2026 41Prompts Inc.
# SPDX-License-Identifier: Apache-2.0

"""Shared support for this package's suite (EPIC-054).

**The real build fixture is `packages/core`'s, read where it lives.** It is the frozen v1 document
`artifact-v1.json`, written by the publisher's own code path and regenerated only by a deliberate
run of `scripts/write-artifact-fixtures.mts`. Reading it rather than copying it means a change in
core's canonical encoding fails these tests instead of silently agreeing with a copy that was made
before it — the same argument that file's own header makes.

It also survives the public mirror: `scripts/mirror-dry-run.sh` filters the tree down to
`packages/core`, `packages/cli`, `packages/sdk-ts` and `sdks/python`, and both ends of this path are
inside it. That check is not incidental — EPIC-053's `packed.test.ts` read `scripts/`, which the
mirror does not have, and *"Local green is not CI green"* failure #1 was the same shape.

**Derived fixtures compute their own hash with the code under test**, which is only sound because
the hash itself is pinned elsewhere: by `canonical_golden.json` against Node, and by the frozen
document above. A test about caching must not also be a test about hashing.
"""

from __future__ import annotations

import json
import pathlib
import threading
from typing import Any, Callable, Mapping, Union

from fortyone._canonical import canonical_json, sha256_text
from fortyone._network import HttpResponse

_HERE = pathlib.Path(__file__).resolve().parent
_ROOT = _HERE.parent.parent.parent
_CORE_FIXTURES = _ROOT / "packages" / "core" / "src" / "artifact" / "fixtures"


def _read(name: str) -> str:
    path = _CORE_FIXTURES / name
    if not path.exists():  # pragma: no cover - a missing fixture is a tree problem, not a test one
        raise AssertionError(
            f"{path} is not there. These tests read packages/core's frozen fixtures rather than "
            "keeping a copy; if the layout moved, move this path with it."
        )
    return path.read_text(encoding="utf-8").rstrip("\n")


BUILD_TEXT = _read("artifact-v1.json")
MARKER_TEXT = _read("live-marker-v1.json")
BUILD: dict[str, Any] = json.loads(BUILD_TEXT)
MARKER: dict[str, Any] = json.loads(MARKER_TEXT)
PROMPT_ID: str = MARKER["promptId"]
BUILD_HASH: str = MARKER["buildHash"]

GOLDEN = json.loads((_HERE / "canonical_golden.json").read_text(encoding="utf-8"))


def rebuild(**changes: Any) -> tuple[dict[str, Any], str]:
    """A variant of the frozen build, re-addressed. Returns the document and its canonical text."""
    body = {key: value for key, value in BUILD.items() if key != "buildHash"}
    body.update(changes)
    document = {**body, "buildHash": sha256_text(canonical_json(body))}
    return document, canonical_json(document)


def marker_for(document: Mapping[str, Any], version: int = 6) -> str:
    return canonical_json(
        {
            "schemaVersion": 1,
            "promptId": document["promptId"],
            "buildHash": document["buildHash"],
            "version": version,
            "publishedAt": "2026-09-17T09:00:00Z",
        }
    )


# A route is either a fixed answer or a function that computes one from the request.
Route = Union[HttpResponse, Callable[[str, Mapping[str, str]], HttpResponse]]


class FakeHttp:
    """A transport that answers from a routing table and counts what was asked of it.

    Nothing in this suite reaches the network. Requests are recorded with their headers so a test
    can assert what was sent as well as what came back.
    """

    def __init__(self, routes: Mapping[str, Route] | None = None) -> None:
        self.routes: dict[str, Route] = dict(routes or {})
        self.calls: list[tuple[str, dict[str, str]]] = []
        self.lock = threading.Lock()

    def __call__(self, url: str, headers: Mapping[str, str], timeout_seconds: float) -> HttpResponse:
        with self.lock:
            self.calls.append((url, dict(headers)))
        answer = self.routes.get(_path_of(url))
        if answer is None:
            return HttpResponse(status=404, headers={}, body="")
        if isinstance(answer, HttpResponse):
            return answer
        return answer(url, headers)

    @property
    def urls(self) -> list[str]:
        with self.lock:
            return [url for url, _ in self.calls]

    def header_for(self, suffix: str, name: str) -> str | None:
        """The header on the **most recent** request to a matching URL.

        The most recent rather than the first, because the interesting question is almost always
        what the second request carried: the first one cannot have an `ETag` to send.
        """
        with self.lock:
            for url, headers in reversed(self.calls):
                if url.endswith(suffix):
                    return headers.get(name)
        return None


def _path_of(url: str) -> str:
    return url.split("://", 1)[-1].split("/", 1)[-1]


def ok(body: str, etag: str | None = None) -> HttpResponse:
    return HttpResponse(status=200, headers={} if etag is None else {"etag": etag}, body=body)


def live_routes(document: Mapping[str, Any], document_text: str, version: int = 6, etag: str = '"v1"') -> dict[str, Route]:
    """The two routes a real server serves for one published prompt."""
    return {
        f"v1/marker/{document['promptId']}": ok(marker_for(document, version), etag),
        f"v1/build/{document['buildHash']}": ok(document_text),
    }


class Clock:
    """A hand-wound clock, so a staleness test is about staleness and not about waiting."""

    def __init__(self, start: float = 1_000.0) -> None:
        self.value = start

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds
