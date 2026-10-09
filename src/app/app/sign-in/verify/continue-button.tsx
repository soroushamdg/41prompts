"use client";
import { useState } from "react";
import { cx } from "@/lib/cx";

export function ContinueButton({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={cx("btn btn--primary btn--lg btn--block", busy && "is-busy")}
      disabled={busy}
      autoFocus
      onClick={() => {
        setBusy(true);
        window.location.assign(href);
      }}
    >
      <span className="btn-spin" aria-hidden="true" />
      <span>{busy ? "Signing in" : "Continue"}</span>
    </button>
  );
}
