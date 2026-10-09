"use client";
import { usePathname } from "next/navigation";

/* The proxy rewrites each host into an internal tree (/app/*, /site/*).
   usePathname() returns the internal path while rendering on the server and
   the visible path in the browser; stripping the tree prefix makes both agree,
   so nav highlighting never causes a hydration mismatch. */
export function visiblePath(pathname: string | null): string {
  if (!pathname) return "/";
  return pathname.replace(/^\/(app|site)(?=\/|$)/, "") || "/";
}

export function useVisiblePath(): string {
  return visiblePath(usePathname());
}
