import { describe, expect, it } from "vitest";
import { routeContext } from "./context";
import { crumbsFor } from "./crumbs";
import type { ShellNames } from "./groups";

const NAMES: ShellNames = {
  projectName: "Example project",
  promptName: "Refund classifier",
  promptProjectId: "proj_027b"
};

/** The trail as a person reads it, so a failure names the string rather than an object shape. */
const trail = (path: string, names: ShellNames = NAMES) =>
  crumbsFor(routeContext(path), names)
    .map((crumb) => crumb.name)
    .join(" / ");

describe("crumbsFor", () => {
  it.each([
    ["/app/projects", "Projects"],
    ["/app/settings/providers", "Settings"],
    ["/app/settings/keys", "Settings"],
    ["/app/account", "Account"]
  ])("%s → %s", (path, expected) => {
    expect(trail(path)).toBe(expected);
  });

  it.each([
    ["/app/pr/pr_7893b994", "Refund classifier / Blok Editor"],
    ["/app/pr/pr_7893b994/runs", "Refund classifier / Runs"],
    ["/app/pr/pr_7893b994/versions", "Refund classifier / Versions"],
    ["/app/pr/pr_7893b994/deploy", "Refund classifier / Deploy"]
  ])("%s → %s", (path, expected) => {
    expect(trail(path)).toBe(expected);
  });

  it.each([
    ["/app/p/proj_027b", "Example project"],
    ["/app/p/proj_027b/connect", "Example project / Connect"]
  ])("%s → %s", (path, expected) => {
    expect(trail(path)).toBe(expected);
  });

  /**
   * The mockup's trail is two deep and does not include the project on a prompt route. A three-deep
   * trail in a bar that also holds a pill, a theme toggle and two actions is what put EPIC-072's
   * nav 185px past a 390px viewport, and the project is one click away in the rail.
   */
  it("is never more than two deep", () => {
    for (const path of [
      "/app/pr/pr_7893b994/runs/run_abc123",
      "/app/pr/pr_7893b994/deploy",
      "/app/p/proj_027b/connect"
    ]) {
      expect(crumbsFor(routeContext(path), NAMES).length, path).toBeLessThanOrEqual(2);
    }
  });

  it("links every segment but the last, and marks nothing beyond it", () => {
    const crumbs = crumbsFor(routeContext("/app/pr/pr_7893b994/runs"), NAMES);
    expect(crumbs[0]?.href).toBe("/app/pr/pr_7893b994");
    expect(crumbs.at(-1)?.href).toBeUndefined();
  });

  /**
   * A run's results page marks Runs in the rail but is not itself a named page, so the trail shows
   * the prompt alone rather than inventing a name for where it is.
   */
  it("shows the prompt alone on a route it has no page name for", () => {
    expect(trail("/app/pr/pr_7893b994/runs/run_abc123")).toBe("Refund classifier / Runs");
    expect(trail("/app/pr/pr_7893b994/nonsense")).toBe("Refund classifier");
  });

  /**
   * A name that is missing — a prompt this owner cannot reach, so the shell read came back
   * undefined — must not render as a gap or as the word `undefined`.
   */
  it("falls back to the workspace when a name is not in hand", () => {
    expect(trail("/app/pr/pr_7893b994/runs", {})).toBe("Projects");
    expect(trail("/app/p/proj_027b", {})).toBe("Projects");
    expect(trail("/app/nonsense")).toBe("Projects");
  });
});
