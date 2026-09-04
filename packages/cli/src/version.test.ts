// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { VERSION, getVersionOutput } from "./version.js";

describe("41p --version", () => {
  it("is 0.0.1", () => {
    expect(VERSION).toBe("0.0.1");
    expect(getVersionOutput()).toBe("0.0.1");
  });
});
