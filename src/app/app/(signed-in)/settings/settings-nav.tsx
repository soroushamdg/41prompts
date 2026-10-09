"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import type { IconName } from "@/components/icons";
import s from "./settings.module.css";

const SECTIONS: Array<[id: string, label: string, icon: IconName]> = [
  ["keys", "Model keys", "key"],
  ["billing", "Plan and billing", "card"],
  ["data", "Data and privacy", "shield"],
  ["account", "Account", "user"],
];

/** Section nav with scroll-spy (the mockup's settings.js). */
export function SettingsNav() {
  const [on, setOn] = useState("keys");
  useEffect(() => {
    const spy = new IntersectionObserver(
      (entries) => entries.forEach((en) => en.isIntersecting && setOn(en.target.id)),
      { rootMargin: "-30% 0px -60% 0px" },
    );
    SECTIONS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) spy.observe(el);
    });
    // The last section can be too short to reach the trigger band: at the
    // bottom of the page, it is the current one.
    const atBottom = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setOn(SECTIONS[SECTIONS.length - 1]![0]);
    };
    window.addEventListener("scroll", atBottom, { passive: true });
    atBottom();
    return () => {
      spy.disconnect();
      window.removeEventListener("scroll", atBottom);
    };
  }, []);
  return (
    <nav className={s.nav} aria-label="Settings sections">
      {SECTIONS.map(([id, label, icon]) => (
        <a key={id} href={`#${id}`} data-on={on === id ? "" : undefined} aria-current={on === id ? "true" : undefined}>
          <Icon name={icon} />
          {label}
        </a>
      ))}
    </nav>
  );
}
