import { describe, expect, it, vi } from "vitest";
import { main } from "./main.js";

describe("worker main", () => {
  it('logs "worker up"', () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    main();
    expect(spy).toHaveBeenCalledWith("worker up");
    spy.mockRestore();
  });
});
