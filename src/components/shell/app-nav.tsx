"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { useVisiblePath } from "@/hooks/use-visible-path";
import s from "./shell.module.css";

export function AppNav() {
  const path = useVisiblePath();
  return (
    <nav className={s.nav} aria-label="App">
      <Link href="/" aria-current={path === "/" ? "page" : undefined}><Icon name="folder" />Library</Link>
      <Link href="/settings" aria-current={path === "/settings" ? "page" : undefined}><Icon name="sliders" />Settings</Link>
    </nav>
  );
}
