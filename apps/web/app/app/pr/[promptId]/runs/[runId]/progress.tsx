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

export function Progress({
  inFlight,
  completed,
  total,
  partnersInFlight = 0,
}: {
  inFlight: boolean;
  completed: number;
  total: number;
  /**
   * How many other runs of this comparison have not answered yet (EPIC-042).
   *
   * The page keeps polling while any of them is in flight, because the matrix on it has a column
   * per run: a comparison's runs are queued together and the worker takes them one at a time, so
   * the first to finish would otherwise render a matrix that never fills in. Found by the browser
   * drive — the e2e could not see it, because it waits on a state the database already has.
   */
  partnersInFlight?: number;
}) {
  const router = useRouter();
  const waiting = inFlight || partnersInFlight > 0;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, router]);

  if (!waiting) return null;

  return (
    <p className="runs-progress" role="status" aria-live="polite" data-testid="progress">
      {inFlight
        ? `Running — ${completed} of ${total} inputs done.`
        : `This run has finished. ${partnersInFlight} of the other providers ${partnersInFlight === 1 ? "is" : "are"} still running.`}
    </p>
  );
}
