/**
 * A project's URL-safe slug.
 *
 * Its own module because two `"use server"` files need it and a server-actions file may export
 * nothing but async functions — so the choice was a shared module or a second copy, and a second
 * copy of a slug rule is how two projects eventually disagree about what their own names mean.
 *
 * The caller appends the project id, so this never has to be unique on its own.
 */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project"
  );
}
