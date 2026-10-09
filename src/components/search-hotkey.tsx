"use client";
import { useEffect } from "react";

/** Cmd/Ctrl+K focuses the page's [data-search] field (M08). */
export function SearchHotkey() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        const s = document.querySelector<HTMLInputElement>("[data-search]");
        if (s) {
          e.preventDefault();
          s.focus();
          s.select();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
