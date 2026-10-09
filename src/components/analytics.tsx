"use client";
import posthog from "posthog-js";
import { useEffect } from "react";
import { setAnalyticsSink } from "@/lib/analytics";

/* PostHog in cookieless mode: no cookies, no consent banner, no session
   recording, no autocapture (which could pick up prompt text). Only the
   events sent through track() and page views leave the browser, with query
   strings removed so sign-in tokens never travel. Reverse-proxied through
   /ingest on our own host. Does nothing without NEXT_PUBLIC_POSTHOG_KEY. */

let started = false;

function stripQuery(url: unknown) {
  return typeof url === "string" ? url.split("?")[0]!.split("#")[0] : url;
}

export function Analytics() {
  useEffect(() => {
    if (started) return;
    started = true;
    // Better Auth sends new accounts to their first page with ?welcome=1.
    const url = new URL(window.location.href);
    const welcome = url.searchParams.get("welcome") === "1";
    if (welcome) {
      url.searchParams.delete("welcome");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      api_host: "/ingest",
      ui_host: (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(".i.posthog.com", ".posthog.com"),
      cookieless_mode: "always",
      persistence: "memory",
      capture_pageview: "history_change",
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      person_profiles: "never",
      before_send: (event) => {
        if (!event) return null;
        for (const k of ["$current_url", "$referrer", "$initial_referrer", "$pathname"]) {
          if (k in event.properties) event.properties[k] = stripQuery(event.properties[k]);
        }
        return event;
      },
    });
    setAnalyticsSink((name, props) => posthog.capture(name, props));
    if (welcome) posthog.capture("signed_up");
  }, []);
  return null;
}
