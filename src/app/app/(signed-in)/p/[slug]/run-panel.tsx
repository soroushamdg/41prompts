"use client";
import { Icon } from "@/components/icon";
import { PerfButton } from "@/components/upgrade/upgrade";
import s from "./editor.module.css";

/** Run (M06) arrives with model keys. */
export function RunPanel() {
  return (
    <>
      <div className={s.runout} data-empty="">Runs the compiled prompt once on one model.{"\n"}Your provider bills your key.</div>
      <PerfButton feature="Side-by-side runs" className="btn--block"><Icon name="columns" />Run on all 3 models <span className="stamp">Performance</span></PerfButton>
    </>
  );
}
