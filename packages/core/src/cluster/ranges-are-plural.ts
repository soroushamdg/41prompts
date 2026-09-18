// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Blok, Range } from "./types.js";

// The type-level half of "a blok owns a set of ranges, never a single one" (`CLAUDE.md` rule 5,
// decision 6). `pnpm typecheck` runs over this file, so if `Blok.ranges` is ever widened to admit a
// bare range these aliases stop compiling and the build fails before any test runs.
//
// This is deliberately a compile-time test rather than a runtime one. A runtime check can only
// observe the bloks a fixture happens to produce; the rule that matters is that no caller can ever
// construct the singular shape in the first place.

/** Fails to compile unless `T` is exactly `true`. */
type Assert<T extends true> = T;

/** `ranges` is an array of ranges. */
export type _RangesIsAnArray = Assert<Blok["ranges"] extends readonly Range[] ? true : false>;

/**
 * A bare `Range` is **not** assignable to `ranges`. If someone "simplifies" `Blok` to allow a
 * single-range blok to carry `ranges: Range`, this alias resolves to `Assert<false>` and errors.
 */
export type _BareRangeIsNotAssignable = Assert<Range extends Blok["ranges"] ? false : true>;

/** A single-range blok is still the plural shape: an array of one. */
export type _OneRangeIsStillAnArray = Assert<
  { id: string; kind: "constraint"; ranges: [Range] } extends Blok ? true : false
>;

/** And the singular shape is not a `Blok` at all. */
export type _SingularBlokIsNotABlok = Assert<
  { id: string; kind: "constraint"; range: Range } extends Blok ? false : true
>;
