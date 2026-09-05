// The closed event set (EPIC-004 decision 2): adding an event means editing this array, not
// scattering string literals through the app. `isEventName` is the runtime half of that
// contract — the TypeScript union catches a typo at compile time, but anything that reaches
// `captureEvent` from outside the type system (a cast, a future untyped caller) is still checked
// for real before it ever reaches PostHog.
export const EVENT_NAMES = [
  "signup",
  "login",
  "decompile_view",
  "decompile_run",
  "decompile_share",
  "project_created",
  "run_started",
  "run_passed",
  "publish",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}
