// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "./index.js";

describe("@41prompts/core", () => {
  it("exports its stub version", () => {
    expect(CORE_VERSION).toBe("0.0.1");
  });
});
