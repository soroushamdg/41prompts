/**
 * The source as the HTML parser will represent it. **The only transformation between an offset and
 * the DOM**, and the reason it exists is measured rather than assumed.
 *
 * React writes a raw `\r` into the server-rendered HTML, and the HTML parser's input-stream
 * preprocessing replaces `\r\n` and a lone `\r` with `\n` before any script runs. It is spec
 * behaviour, not a React bug: `"One.\r\nTwo.\r\n"` is 12 characters in the source and arrives in the
 * DOM as 10. Everything else the four required fixtures cover — tabs, emoji with combining marks and
 * ZWJ sequences, RTL runs, a byte-order mark, a lone surrogate, leading and trailing spaces — passes
 * through untouched.
 *
 * Two things follow, and the second is the one that would otherwise have shipped:
 *
 * 1. `textContent` can never equal the raw source slice for CRLF text, so the highlight-exactness
 *    check has to be made in **DOM space**, against this function's output.
 * 2. Without it, **hydration breaks on every Windows-pasted prompt** — React's expected text node
 *    holds `\r\n` where the DOM holds `\n`.
 *
 * **Shared by the decompiler's source map and the compiled pane.** Two copies of this is
 * precisely how two surfaces come to disagree about what a span covers — EPIC-013's note said one
 * function sits between source space and DOM space, and it now has one home rather than one per
 * feature.
 *
 * The input itself is *not* normalised anywhere: `Range` offsets keep indexing the original string,
 * because EPIC-014 captures that string and because a blok owning the verbatim span is a rule worth
 * not eroding from the edge. This is a display concern and it lives in exactly one place.
 */
export function toDisplayText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
