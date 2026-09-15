"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Progress while a run is in flight, **without a reload**.
 *
 * `router.refresh()` asks the server for this route's rendering again and swaps it into the page
 * that is already open: no navigation, no full document load, nothing on screen is thrown away.
 * That distinction is the acceptance criterion, and it is also the one a reload would quietly
 * satisfy while hiding whether anything else on the page updates by itself — the same shape as the
 * `addBlok` helpers that ended in `page.reload()` and blinded every test in two files.
 *
 * It polls only while there is something to poll for, and it stops the moment the run reaches a
 * terminal state. A timer that keeps asking after a run has finished is a page that costs a request
 * a second for as long as somebody leaves the tab open.
 *
 * The count is announced politely rather than assertively: a number changing every second under an
 * `alert` would interrupt a screen-reader user continuously.
 */
const POLL_MS = 1_200;

export function Progress({ inFlight, completed, total }: { inFlight: boolean; completed: number; total: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, router]);

  if (!inFlight) return null;

  return (
    <p className="runs-progress" role="status" aria-live="polite" data-testid="progress">
      Running — {completed} of {total} inputs done.
    </p>
  );
}
