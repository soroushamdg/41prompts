import { describe, expect, it } from "vitest";
import { routeContext } from "./context";

describe("routeContext", () => {
  it.each([
    ["/app/projects", { current: "projects" }],
    ["/app/settings/providers", { current: "settings" }],
    ["/app/settings/keys", { current: "settings" }],
    ["/app/settings/publishing", { current: "settings" }],
    ["/app/account", { current: "account" }],
    ["/app/account/delete", { current: "account" }]
  ])("%s → %o", (path, expected) => {
    expect(routeContext(path)).toEqual(expected);
  });

  it("a project route carries its id and names its two destinations", () => {
    expect(routeContext("/app/p/proj_027b")).toEqual({
      projectId: "proj_027b",
      current: "prompts"
    });
    expect(routeContext("/app/p/proj_027b/connect")).toEqual({
      projectId: "proj_027b",
      current: "connect"
    });
  });

  it.each([
    ["/app/pr/pr_7893b994", "editor"],
    ["/app/pr/pr_7893b994/runs", "runs"],
    ["/app/pr/pr_7893b994/versions", "versions"],
    ["/app/pr/pr_7893b994/deploy", "deploy"]
  ])("%s marks %s", (path, current) => {
    expect(routeContext(path)).toEqual({ promptId: "pr_7893b994", current });
  });

  /**
   * A run's results page is reached through Runs and belongs to it. Marking nothing there would
   * leave the rail with no current item on the page a failing check sends you to, which is the one
   * page somebody arrives at without having navigated.
   */
  it("a run's results page still marks Runs", () => {
    expect(routeContext("/app/pr/pr_7893b994/runs/run_abc123")).toEqual({
      promptId: "pr_7893b994",
      current: "runs"
    });
  });

  /**
   * The ids are shape-checked (`CLAUDE.md`, Naming: `proj_` + 4 hex, `pr_` + 8 hex). Without this a
   * contextual group would be headed with whatever a visitor typed, and the heading is a record's
   * name rendered as text.
   */
  it.each([
    "/app/p/not-an-id",
    "/app/p/proj_ZZZZ",
    "/app/p/proj_027",
    "/app/pr/pr_short",
    "/app/pr/pr_7893b99g",
    "/app/pr/../../etc"
  ])("%s yields no context", (path) => {
    expect(routeContext(path)).toEqual({});
  });

  it("a path outside /app yields no context", () => {
    expect(routeContext("/decompile")).toEqual({});
    expect(routeContext("/")).toEqual({});
  });

  /**
   * `/app` itself is redirected by the proxy before a layout sees it, but an unknown path under
   * `/app` still renders inside the layout — a 404 does. The rail must have an answer for it.
   */
  it("an unknown route under /app renders the rail with nothing current", () => {
    expect(routeContext("/app")).toEqual({});
    expect(routeContext("/app/nonsense")).toEqual({});
    expect(routeContext("/app/pr/pr_7893b994/nonsense")).toEqual({ promptId: "pr_7893b994" });
  });

  it("tolerates a trailing slash and a doubled separator", () => {
    expect(routeContext("/app/projects/")).toEqual({ current: "projects" });
    expect(routeContext("//app//projects")).toEqual({ current: "projects" });
  });
});
