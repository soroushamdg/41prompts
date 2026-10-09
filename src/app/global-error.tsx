"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last resort when a root layout itself fails: plain HTML, inline styles. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A1830", color: "#E9F1FF", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>41prompts did not load.</h1>
          <p style={{ color: "#C9D7EE", margin: "0 0 18px" }}>Reload the page. If it keeps happening, it is on our side and we have been told.</p>
          <a href="/" style={{ color: "#9CC3FF" }}>Reload</a>
        </div>
      </body>
    </html>
  );
}
