import { strToU8 } from "fflate";
import { BLOK_LABEL, type Blok } from "./bloks";
import { blokText } from "./compile";

/* Export everything (M09): every prompt with every version, as Markdown and
   JSON, in one .zip. Built in the browser from pages of /api/export so the
   server never holds a whole library in memory. */

export type ExportVersion = { number: number; note: string; name: string | null; createdAt: string; bloks: Blok[] };
export type ExportPrompt = {
  slug: string;
  sheetNumber: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  fillValues: Record<string, string>;
  versions: ExportVersion[];
};

const stamp = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

export function promptMarkdown(p: ExportPrompt): string {
  const out = [`# ${p.slug}`, "", `Sheet ${String(p.sheetNumber).padStart(2, "0")} · ${p.versions.length} ${p.versions.length === 1 ? "version" : "versions"}${p.archived ? " · archived" : ""}`];
  for (const v of p.versions) {
    out.push("", `## v${v.number}${v.name ? ` · ${v.name}` : ""} · ${stamp(v.createdAt)}`, "", v.note);
    for (const b of v.bloks) out.push("", `### ${BLOK_LABEL[b.type]} (${b.id})`, "", blokText(b.text));
  }
  return out.join("\n") + "\n";
}

export function promptJson(p: ExportPrompt): string {
  return JSON.stringify({ format: "41prompts.prompt/v1", ...p }, null, 2) + "\n";
}

/** Folder-safe and unique within the archive. */
function folder(slug: string, used: Set<string>) {
  let name = slug.replace(/[^a-z0-9-]/g, "-") || "prompt";
  for (let i = 2; used.has(name); i++) name = `${slug}-${i}`;
  used.add(name);
  return name;
}

export function exportFiles(prompts: ExportPrompt[], exportedAt: string, onStage?: (stage: "markdown" | "json") => void): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const dirs = prompts.map((p) => folder(p.slug, used));
  onStage?.("markdown");
  prompts.forEach((p, i) => (files[`41prompts/${dirs[i]}/${dirs[i]}.md`] = strToU8(promptMarkdown(p))));
  onStage?.("json");
  prompts.forEach((p, i) => (files[`41prompts/${dirs[i]}/${dirs[i]}.json`] = strToU8(promptJson(p))));
  const index = {
    format: "41prompts.library/v1",
    exportedAt,
    prompts: prompts.map((p, i) => ({ name: p.slug, folder: dirs[i], versions: p.versions.length, archived: p.archived, updatedAt: p.updatedAt })),
  };
  files["41prompts/library.json"] = strToU8(JSON.stringify(index, null, 2) + "\n");
  return files;
}

export function exportFileName(d = new Date()): string {
  return `41prompts-export-${d.toISOString().slice(0, 10)}.zip`;
}
