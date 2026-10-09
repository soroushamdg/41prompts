"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Something broke on a page. Typed work is kept as a local draft by the editor. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="app-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="frame" style={{ padding: 28, maxWidth: 460, display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="sheetno">Error{error.digest ? ` · ${error.digest}` : ""}</span>
        <h1 style={{ margin: 0, fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 30, letterSpacing: "-.02em" }}>This page did not load.</h1>
        <p style={{ margin: 0, color: "var(--chalk-2)" }}>Nothing you typed is lost: the editor keeps unsaved changes on this device. Try again, or go back to the library.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn--primary" type="button" onClick={reset}>Try again</button>
          <a className="btn" href="/">Library</a>
        </div>
      </div>
    </main>
  );
}
