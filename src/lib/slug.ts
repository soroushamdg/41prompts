/** Prompt names are slugs: lowercase letters, digits and dashes (M02). */
export function slugify(input: string, fallback = "untitled-prompt"): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || fallback;
}

/** A name from the first words of a pasted prompt, when none was given. */
export function nameFromText(text: string): string {
  const words = text
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 4)
    .join(" ");
  return slugify(words);
}

/** The next free variant: name, name-2, name-3 … */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, 56)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}
