# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

"""One value, one sequence of bytes — the same sequence ``packages/core`` produces.

This is a port of ``packages/core/src/artifact/canonical.ts``, and it is the one file in this
package where being nearly right is worse than being absent. The content address of a build is
``sha256`` over these bytes, so an encoder that disagrees with the publisher's by a single
character makes every build fail verification — and the code that reports that failure says
``hash_mismatch``, which means *somebody served you a document that is not the one that is Live*.
A correctness defect that presents as a security alert is the worst shape available, so the rules
below are stated in full and pinned by a golden generated from Node itself.

The rules are ``canonical.ts``'s, unchanged:

1. **Object keys are sorted**, ascending, by UTF-16 code unit.
2. **Array order is preserved.** Order is meaning in an array.
3. **No insignificant whitespace.** ``{"a":1}``, never ``{ "a": 1 }``.
4. **Strings are escaped as ECMA-262's QuoteJSONString escapes them**, including lone surrogates.
5. **Numbers are serialised by ECMA-262's Number::toString.**
6. **Bytes are UTF-8**, produced at the point of hashing.

And it refuses, rather than substituting, everything ``canonical.ts`` refuses: a non-finite number,
a value that is not JSON, a cycle. The reason is the same one written there — a value quietly
becoming a different value on the way into a hash that something else will later verify.

## The four places Python and JavaScript disagree, all of them real

**1. Numbers.** ``json.dumps(1.0)`` is ``"1.0"`` and ``JSON.stringify(1.0)`` is ``"1"``. JavaScript
parses every JSON number as a double and prints it by ``Number::toString``; Python keeps integers
exact and formats floats by ``repr``, whose exponent thresholds (1e16, 1e-5) are not JavaScript's
(1e21, 1e-7) and whose exponent form is ``1e-07`` against ``1e-7``. A build whose parameters carry
``{"temperature": 1.0}`` would hash two ways. :func:`js_number` closes it.

**2. Key order.** ``canonical.ts`` sorts by UTF-16 code unit — plain ``<`` on JavaScript strings.
Python's ``sorted`` compares code points, and the two disagree for any key holding a character above
U+FFFF, because a surrogate pair sorts as 0xD800-something. :func:`_sort_key` encodes to UTF-16BE
and compares those bytes, which is the same ordering by construction.

**3. Lone surrogates.** ``JSON.stringify("\\ud800")`` yields the six characters ``\\ud800``. Python's
``json`` emits the character itself with ``ensure_ascii=False``, and that string cannot be encoded
as UTF-8 at all. A build can hold one: ``JSON.parse`` produces it from a ``\\ud800`` escape.

**4. Integers larger than a double.** ``json.loads`` gives Python an exact ``int``; JavaScript gave
itself a rounded double. Every number is therefore put through ``float`` before it is formatted,
which is exactly what the publisher's engine did to it.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

__all__ = ["CanonicalError", "canonical_json", "js_number", "sha256_text"]


class CanonicalError(ValueError):
    """A value with no canonical form, and the path to it.

    A named class rather than a bare ``ValueError`` for the reason ``canonical.ts`` gives for its
    own: this package never raises at its surface, and it has to be able to tell this apart from a
    programming mistake it should let through.
    """

    def __init__(self, path: str, reason: str) -> None:
        super().__init__(f"cannot canonically encode {path or 'the root value'}: {reason}")
        self.path = path


# ── numbers ───────────────────────────────────────────────────────────────────────────────────────

# ``repr`` of a finite float is always one of ``123``, ``123.45``, ``1.5e+18``, ``1e-07``.
_REPR = re.compile(r"^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$")


def js_number(value: float | int) -> str:
    """Format a number exactly as ``JSON.stringify`` would.

    ECMA-262 §6.1.6.1.20 (``Number::toString``, radix 10). The value is decomposed into the shortest
    decimal digits *s* and the exponent *n* such that the value is ``0.s × 10**n``, and then rendered
    by that clause's five cases. Python's ``repr`` is also a shortest-round-trip representation, so
    it supplies *s* and *n*; what differs between the two languages is only how they are laid out,
    and that is what this re-renders.
    """
    try:
        number = float(value)
    except OverflowError as failure:
        # An `int` too large for a double. JavaScript never had one: `JSON.parse` would have made
        # it `Infinity`, which has no JSON form either, so both languages refuse the same input.
        raise CanonicalError("", "the integer is too large for a JSON number") from failure
    if number != number or number in (float("inf"), float("-inf")):
        raise CanonicalError("", f"{number} has no JSON form")
    if number == 0.0:
        # ``-0`` becomes ``0``, as it does in JavaScript and everywhere else.
        return "0"

    sign = "-" if number < 0 else ""
    parsed = _REPR.match(repr(abs(number)))
    if parsed is None:  # pragma: no cover - CPython has no other repr for a finite float
        raise CanonicalError("", f"{number!r} has no readable representation")
    whole, fraction, exponent = parsed.groups()
    fraction = fraction or ""
    digits = whole + fraction
    # Where the decimal point sits in ``digits``, before the exponent is applied.
    point = len(whole) + int(exponent or 0)

    stripped = digits.lstrip("0")
    point -= len(digits) - len(stripped)
    digits = stripped.rstrip("0") or "0"

    n = point
    k = len(digits)

    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    power = n - 1
    head = digits if k == 1 else digits[0] + "." + digits[1:]
    return f"{sign}{head}e{'+' if power >= 0 else '-'}{abs(power)}"


# ── strings ───────────────────────────────────────────────────────────────────────────────────────

_SHORT = {
    0x08: "\\b",
    0x09: "\\t",
    0x0A: "\\n",
    0x0C: "\\f",
    0x0D: "\\r",
    0x22: '\\"',
    0x5C: "\\\\",
}


def _js_string(value: str) -> str:
    """A string literal, escaped as ECMA-262's QuoteJSONString escapes it.

    Everything printable and non-ASCII is emitted as itself — the output is UTF-8 and JavaScript
    does the same. Only the seven short escapes, the C0 controls, and **lone surrogates** are
    written out. That last one is why this is not ``json.dumps``: a lone surrogate reaching UTF-8
    encoding is a ``UnicodeEncodeError``, and an unpaired one is the exact thing an untrusted
    document can carry.
    """
    out = ['"']
    for character in value:
        code = ord(character)
        short = _SHORT.get(code)
        if short is not None:
            out.append(short)
        elif code < 0x20 or 0xD800 <= code <= 0xDFFF:
            out.append(f"\\u{code:04x}")
        else:
            out.append(character)
    out.append('"')
    return "".join(out)


def _sort_key(key: str) -> bytes:
    """UTF-16 code-unit order, which is what ``<`` on a JavaScript string means.

    ``surrogatepass`` so that a key already holding a lone surrogate sorts rather than raising.
    """
    return key.encode("utf-16-be", "surrogatepass")


# ── the encoder ───────────────────────────────────────────────────────────────────────────────────


def _encode(value: Any, path: str, seen: set[int], out: list[str]) -> None:
    if value is None:
        out.append("null")
        return
    if value is True:
        out.append("true")
        return
    if value is False:
        out.append("false")
        return
    if isinstance(value, str):
        out.append(_js_string(value))
        return
    if isinstance(value, (int, float)):
        try:
            out.append(js_number(value))
        except CanonicalError as failure:
            raise CanonicalError(path, str(failure).split(": ", 1)[-1]) from failure
        return

    identity = id(value)
    if identity in seen:
        raise CanonicalError(path, "the value contains a cycle")
    seen.add(identity)
    try:
        if isinstance(value, (list, tuple)):
            out.append("[")
            for index, item in enumerate(value):
                if index:
                    out.append(",")
                _encode(item, f"{path}[{index}]", seen, out)
            out.append("]")
            return
        if isinstance(value, dict):
            out.append("{")
            keys = sorted(value.keys(), key=_sort_key)
            for index, key in enumerate(keys):
                if not isinstance(key, str):
                    raise CanonicalError(path, "an object key is not a string")
                if index:
                    out.append(",")
                out.append(_js_string(key))
                out.append(":")
                _encode(value[key], key if path == "" else f"{path}.{key}", seen, out)
            out.append("}")
            return
        raise CanonicalError(path, f"{type(value).__name__} has no JSON form")
    finally:
        # Removed on the way out, so the *same* value appearing twice side by side — a shared
        # reference, not a cycle — encodes rather than being refused. ``canonical.ts`` does the same.
        seen.discard(identity)


def canonical_json(value: Any) -> str:
    """The canonical JSON text of a value.

    Two structurally equal values produce identical strings whatever order their keys were inserted
    in, at every depth — and identical to the string ``packages/core`` produces for the same value.
    """
    out: list[str] = []
    _encode(value, "", set(), out)
    return "".join(out)


def sha256_text(text: str) -> str:
    """Lowercase hex digest of the UTF-8 bytes of ``text``.

    ``hashlib`` rather than a written-out implementation. ``packages/core`` writes its own only
    because it may have no dependency *and no* ``node:crypto``; the standard library has no such
    gap here, and a second implementation of a digest is a second thing that can be wrong.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
