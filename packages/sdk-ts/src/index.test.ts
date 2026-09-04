// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { resolve } from "./index.js";

describe("resolve", () => {
  it("never throws and reports unavailable", () => {
    expect(() => resolve("pr_x", {})).not.toThrow();
    expect(resolve("pr_x", {})).toEqual({ text: "", status: "unavailable" });
  });

  it("calls onWarning instead of throwing", () => {
    const onWarning = vi.fn();
    resolve("pr_x", {}, { onWarning });
    expect(onWarning).toHaveBeenCalledWith("not implemented");
  });
});
