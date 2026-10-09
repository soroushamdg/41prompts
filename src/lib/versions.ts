import type { Blok } from "./bloks";

/* Version notes are derived on the server from the difference between the
   previous version and the new one, so every row in History says what
   changed without the client having to describe it. */

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function list(ids: string[]): string {
  return ids.join(", ");
}

export function describeChange(prev: Blok[], next: Blok[]): string {
  const before = new Map(prev.map((b) => [b.id, b]));
  const after = new Map(next.map((b) => [b.id, b]));
  const added = next.filter((b) => !before.has(b.id));
  const removed = prev.filter((b) => !after.has(b.id));
  const kept = next.filter((b) => before.has(b.id));
  const retyped = kept.filter((b) => before.get(b.id)!.type !== b.type);
  const edited = kept.filter((b) => before.get(b.id)!.text !== b.text);

  const parts: string[] = [];
  const consumedAdds = new Set<string>();
  const consumedEdits = new Set<string>();

  // Split: an edited blok whose old text is its new text plus the text of the
  // blok added right after it.
  for (const b of edited) {
    const i = next.findIndex((x) => x.id === b.id);
    const follower = next[i + 1];
    if (follower && !before.has(follower.id) && norm(b.text + " " + follower.text) === norm(before.get(b.id)!.text)) {
      parts.push(`Split ${b.id}`);
      consumedAdds.add(follower.id);
      consumedEdits.add(b.id);
    }
  }
  // Duplicate: an added blok identical to one that already existed.
  for (const a of added) {
    if (consumedAdds.has(a.id)) continue;
    const source = prev.find((p) => p.type === a.type && p.text === a.text && p.text.trim() !== "");
    if (source) {
      parts.push(`Duplicated ${source.id}`);
      consumedAdds.add(a.id);
    }
  }
  const plainAdds = added.filter((a) => !consumedAdds.has(a.id)).map((a) => a.id);
  if (plainAdds.length) parts.push(`Added ${list(plainAdds)}`);
  if (removed.length) parts.push(`Deleted ${list(removed.map((b) => b.id))}`);
  for (const b of retyped) parts.push(`Changed ${b.id} to ${b.type}`);
  const plainEdits = edited.filter((b) => !consumedEdits.has(b.id)).map((b) => b.id);
  if (plainEdits.length) parts.push(`Edited ${list(plainEdits)}`);

  const order = (bs: Blok[]) => bs.filter((b) => before.has(b.id) && after.has(b.id)).map((b) => b.id).join();
  if (order(prev) !== order(next)) parts.push("Reordered bloks");

  if (!parts.length) return "No changes";
  if (parts.length > 3) return `${parts.slice(0, 3).join(" · ")} · and ${parts.length - 3} more`;
  return parts.join(" · ");
}

/** The library subtitle: the first line of the first non-empty blok. */
export function describeBloks(bloks: Blok[]): string {
  const first = bloks.find((b) => b.text.trim());
  if (!first) return "";
  const line = first.text.trim().split("\n")[0]!.trim();
  return line.length > 120 ? `${line.slice(0, 117).trimEnd()}…` : line;
}

/** The highest numeric blok ID in a list, so new IDs never collide. */
export function maxBlokNumber(bloks: Blok[]): number {
  return bloks.reduce((m, b) => Math.max(m, Number(b.id.slice(1)) || 0), 0);
}
