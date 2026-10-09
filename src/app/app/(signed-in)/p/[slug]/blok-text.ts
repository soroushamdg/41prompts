import { splitVariables } from "@/lib/variables";

/* The editable blok text is managed outside React: React never re-renders
   it while someone types (that would move the caret). It is repainted only
   when the text changes from outside (split, undo, restore) or on blur, when
   {{variables}} become pills again, as in the mockup. */

export function readText(el: HTMLElement): string {
  // innerText keeps the user's line breaks for plaintext-only editing; a lone
  // trailing newline is the browser's placeholder for an empty last line.
  const t = el.innerText.replace(/ /g, " ");
  return t === "\n" ? "" : t;
}

export function paintText(el: HTMLElement, text: string) {
  const frag = document.createDocumentFragment();
  for (const part of splitVariables(text)) {
    if (part.variable) {
      const s = document.createElement("span");
      s.className = "var";
      s.textContent = part.text;
      frag.appendChild(s);
    } else frag.appendChild(document.createTextNode(part.text));
  }
  el.replaceChildren(frag);
}

/** Caret position as a character offset into the element's text. */
export function caretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.anchorNode!, sel.anchorOffset);
  return range.toString().length;
}

/** Puts the caret at a character offset (0 = start). */
export function placeCaret(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = offset;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (left <= len) {
      const r = document.createRange();
      r.setStart(node, left);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    left -= len;
    node = walker.nextNode();
  }
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(offset === 0);
  sel.removeAllRanges();
  sel.addRange(r);
}
