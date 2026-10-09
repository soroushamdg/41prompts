import { strFromU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportFileName, exportFiles, type ExportPrompt } from "./export";

const p: ExportPrompt = {
  slug: "support-reply",
  sheetNumber: 7,
  archived: false,
  createdAt: "2026-10-05T10:00:00.000Z",
  updatedAt: "2026-10-09T14:02:00.000Z",
  fillValues: { customer_name: "Sam" },
  versions: [
    { number: 2, note: "Added B2", name: "works on Claude", createdAt: "2026-10-09T14:02:00.000Z", bloks: [{ id: "B1", type: "context", text: "Hi" }, { id: "B2", type: "expects", text: "No refunds." }] },
    { number: 1, note: "Created from paste", name: null, createdAt: "2026-10-05T10:00:00.000Z", bloks: [{ id: "B1", type: "context", text: "Hi" }] },
  ],
};

describe("export", () => {
  it("writes Markdown and JSON per prompt plus a library index, with every version", () => {
    const files = exportFiles([p, { ...p, versions: [p.versions[1]!] }], "2026-10-09T15:00:00.000Z");
    const zip = unzipSync(zipSync(files));
    expect(Object.keys(zip).sort()).toEqual([
      "41prompts/library.json",
      "41prompts/support-reply-2/support-reply-2.json",
      "41prompts/support-reply-2/support-reply-2.md",
      "41prompts/support-reply/support-reply.json",
      "41prompts/support-reply/support-reply.md",
    ]);
    const md = strFromU8(zip["41prompts/support-reply/support-reply.md"]!);
    expect(md).toContain("## v2 · works on Claude · 2026-10-09 14:02 UTC");
    expect(md).toContain("### Expects (B2)\n\nNo refunds.");
    expect(md).toContain("## v1 · 2026-10-05 10:00 UTC");
    const json = JSON.parse(strFromU8(zip["41prompts/support-reply/support-reply.json"]!));
    expect(json.versions).toHaveLength(2);
    expect(JSON.parse(strFromU8(zip["41prompts/library.json"]!)).prompts).toHaveLength(2);
    expect(exportFileName(new Date("2026-10-09T12:00:00Z"))).toBe("41prompts-export-2026-10-09.zip");
  });
});
