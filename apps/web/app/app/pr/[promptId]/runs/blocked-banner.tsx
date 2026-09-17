import { StatusIcon } from "@41prompts/ui";

/**
 * "This cannot go Live", on the page where the reason was made (EPIC-055 C15).
 *
 * ## Why it belongs on Runs and not only on Deploy
 *
 * The gate's blocking rows are **checks** and **contract**, and the checks row is decided by a run.
 * So the moment a person learns their prompt cannot be published is a run finishing on this page —
 * and before this epic they learned it by going to another page and finding a disabled button.
 *
 * `docs/roadmap.md`'s task line calls it the "Runs page blocked banner" and this is that.
 *
 * ## It is absent when nothing is blocked
 *
 * Not "present and empty", not "present and green". A banner that is always there stops being read,
 * and this one has something to say only when there is something wrong. `runs-blocked.spec.ts`
 * asserts both directions, because a banner that never renders passes the negative test.
 */
export function BlockedBanner({ promptId, says }: { promptId: string; says: string }) {
  return (
    <div className="runs-blocked" role="status">
      <span className="runs-blocked-icon">
        <StatusIcon status="fail" />
      </span>
      <span className="runs-blocked-what">
        <b>This cannot go Live yet</b>
        <span>{says}</span>
      </span>
      <a className="btn btn-sm" href={`/app/pr/${promptId}/deploy`}>
        Open Deploy
      </a>
    </div>
  );
}
