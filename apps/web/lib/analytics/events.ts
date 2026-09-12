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
  // EPIC-015 decision 5 asks for the waitlist submission alongside the three decompile events, and
  // EPIC-004's own rule is that the set grows by editing this array rather than by a string literal
  // appearing somewhere. It is the M1 criterion's second half: 15% share **or waitlist**.
  "waitlist_joined",
  "project_created",
  "run_started",
  "run_passed",
  "publish",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}
