# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

import fortyone


def test_resolve_never_raises():
    result = fortyone.resolve("pr_x", {})
    assert result == {"text": "", "status": "unavailable"}


def test_resolve_calls_on_warning():
    warnings = []
    fortyone.resolve("pr_x", {}, on_warning=warnings.append)
    assert warnings == ["not implemented"]
