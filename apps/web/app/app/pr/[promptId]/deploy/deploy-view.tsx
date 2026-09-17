"use client";

import { Button, StatusIcon, Textarea } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Deploy, as a person uses it.
 *
 * ## Why these three actions POST rather than call a server action
 *
 * `POST /api/prompts/:id/publish` and `…/undo` already exist and are the product's behaviour
 * (EPIC-051 ruling 5): origin-checked, returning **409 with the gate** when the gate stops them, and
 * chosen deliberately as endpoints because `docs/roadmap.md` names them that way and because a
 * server action returns a value rather than a status. Wrapping them in an action would be a second
 * door into one room, and the 409's body — which carries the gate rows — is exactly what this page
 * wants to show when a publish is refused between the render and the press.
 *
 * ## The reason field appears before the act, not after it
 *
 * "Publish anyway" and "Undo" both require a typed reason of at least ten characters (`CLAUDE.md`
 * rule 9, and EPIC-051 ruling 3 for Undo). The field is disclosed by pressing the button, and the
 * confirm is disabled until the reason is long enough — so the requirement is visible rather than
 * arriving as a refusal after somebody has committed to the act.
 *
 * ## Colour, and the one place amber appears
 *
 * Every verdict carries a glyph **and a word** (`CLAUDE.md` rule 10), so nothing here is decided by
 * colour. Amber appears on exactly one row and only sometimes: the cost row, when the cost has
 * actually moved against a Live build.
 *
 * **That is `packages/core`'s ruling, not this component's, and it is worth knowing that it
 * overrides a line in `docs/design/README.md`.** The README's colour correction says "cost deltas
 * use neutral ink"; `publish/gate.ts` gives a moved cost the `drift` verdict with its own comment —
 * "Rule 10 gives amber exactly one meaning and this is it: a number that moved". Core is right and
 * shipped in EPIC-051: the README's correction was written about the *mockup's* badge, which paints
 * a delta amber whether or not there is anything to compare it against, and rule 10 defines what
 * amber **means** rather than which rows may earn it. A cost that moved against a real Live build
 * is a number that drifted. EPIC-055 ruling 11.
 *
 * "Unsaved" and the blok-diff row are neutral ink, which is the part of the README's correction
 * that was always about this page and still binds.
 */

const REASON_MIN = 10;

export function DeployView({ promptId, draft, live, gate, history }: DeployViewProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<Said | undefined>();
  const [asking, setAsking] = useState<"anyway" | "undo" | undefined>();
  const [reason, setReason] = useState("");

  const post = (path: string, body: Record<string, unknown>) =>
    start(async () => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { says?: string };
      setSaid({ ok: response.ok, says: payload.says ?? (response.ok ? "Live has moved." : "That did not work.") });
      if (response.ok) {
        setAsking(undefined);
        setReason("");
        router.refresh();
      }
    });

  const publish = () => post(`/api/prompts/${promptId}/publish`, {});
  const publishAnyway = () => post(`/api/prompts/${promptId}/publish`, { reason });
  const undo = () => post(`/api/prompts/${promptId}/undo`, { reason });

  const reasonReady = reason.trim().length >= REASON_MIN;

  return (
    <>
      <section className="deploy-envs" aria-label="What is Live and what is Draft">
        <article className={live === null ? "deploy-env deploy-env-empty" : "deploy-env deploy-env-live"}>
          <h2>Live</h2>
          {live === null ? (
            <>
              <p className="deploy-env-version">Nothing yet</p>
              <p className="deploy-env-when">
                No version of this prompt has ever been published, so no application can resolve it.
              </p>
            </>
          ) : (
            <>
              <p className="deploy-env-version">{live.name}</p>
              <p className="deploy-env-when">
                {live.kind === "undone" ? "Went back to this" : "Published"} {when(live.when)}
              </p>
              {live.isSameVersion && <p className="deploy-env-same">This is the version you are editing.</p>}
              <p className="deploy-env-build">
                <span className="deploy-env-buildlabel">Build</span>
                <code title={live.buildHash}>{live.shortBuild}</code>
              </p>
            </>
          )}
        </article>

        <article className="deploy-env deploy-env-draft">
          <h2>Draft</h2>
          <p className="deploy-env-version">{draft.name}</p>
          <p className="deploy-env-when">Last written {when(draft.when)}</p>
          <p className="deploy-env-build">
            <span className="deploy-env-buildlabel">Build</span>
            <code title={draft.buildHash}>{draft.shortBuild}</code>
          </p>
        </article>
      </section>

      <section className="deploy-gate" aria-label={`Publishing ${draft.name} to Live`}>
        <div className="deploy-gatehead">
          <h2>Publish {draft.name} to Live</h2>
          <span className={gate.blocked ? "deploy-gatestate deploy-gatestate-stopped" : "deploy-gatestate"}>
            <StatusIcon status={gate.blocked ? "fail" : "pass"} />
            {gate.blocked ? "Stopped" : "Ready"}
          </span>
        </div>

        <ul className="deploy-rows">
          {gate.rows.map((row) => (
            <li key={row.kind} className={`deploy-row deploy-row-${row.verdict}`} data-verdict={row.verdict}>
              <span className="deploy-row-icon">
                {row.verdict === "info" ? (
                  <span aria-hidden="true" className="status-icon">
                    Δ
                  </span>
                ) : (
                  <StatusIcon status={row.verdict} />
                )}
              </span>
              <span className="deploy-row-what">
                <b>{row.title}</b>
                <span className="deploy-row-says">{row.says}</span>
                <span className="deploy-row-cost">
                  <span className="deploy-row-verdict">{row.verdictWord}</span>
                  {" · "}
                  {row.blockingWords}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {said !== undefined && (
          <p className={said.ok ? "deploy-said" : "deploy-said deploy-said-refused"} role="status">
            {said.says}
          </p>
        )}

        <div className="deploy-actions">
          {gate.blocked ? (
            <>
              {/* Disabled, and it says what is stopping it. A grey button with the ordinary label
                  makes somebody press it twice to find out. */}
              <Button variant="primary" disabled className="deploy-action-wide">
                {stoppedBy(gate)}
              </Button>
              <Button
                variant="ghost"
                className="deploy-action-wide"
                onClick={() => setAsking(asking === "anyway" ? undefined : "anyway")}
                aria-expanded={asking === "anyway"}
              >
                Publish anyway
              </Button>
            </>
          ) : (
            <Button variant="primary" className="deploy-action-wide" disabled={pending} onClick={publish}>
              Publish {draft.name} to Live
            </Button>
          )}

          {live !== null && (
            <Button
              variant="ghost"
              className="deploy-action-wide"
              onClick={() => setAsking(asking === "undo" ? undefined : "undo")}
              aria-expanded={asking === "undo"}
            >
              Undo
            </Button>
          )}
        </div>

        {asking !== undefined && (
          <div className="deploy-reason">
            <label className="deploy-reason-label" htmlFor="deploy-reason">
              {asking === "anyway"
                ? "Say why this is going Live with a check failing. Everyone who reads the history will see it."
                : "Say why Live is going back. Everyone who reads the history will see it."}
            </label>
            <Textarea
              id="deploy-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="latency spike on Gemini"
            />
            <p className="deploy-reason-count">
              {reasonReady
                ? "That will do."
                : `At least ${REASON_MIN} characters — ${reason.trim().length} so far.`}
            </p>
            <div className="deploy-actions">
              <Button
                variant="primary"
                disabled={!reasonReady || pending}
                onClick={asking === "anyway" ? publishAnyway : undo}
              >
                {asking === "anyway" ? `Publish ${draft.name} anyway` : "Undo to the version before"}
              </Button>
              <Button variant="ghost" onClick={() => setAsking(undefined)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Ruling 2: not an empty table, and not invented rows. */}
      <section className="runs-panel" aria-label="Apps calling this prompt">
        <h2>Apps calling this prompt</h2>
        <p className="runs-note">
          This will list every application resolving this prompt, which version each one is on, and
          how often. It is read from the access log of the network that serves the builds, and that
          network does not exist yet — so there is nothing to show rather than nothing happening.
        </p>
        <p className="runs-note">
          Nothing is counted by asking your application to tell us it exists, and nothing ever will
          be.
        </p>
      </section>

      <section className="deploy-history" aria-label="Publish history">
        <h2>Publish history</h2>
        {history.length === 0 ? (
          <p className="runs-note">Nothing has been published yet. The first publish will be the first row here.</p>
        ) : (
          <table className="deploy-historytable">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Version</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {history.map((event) => (
                <tr key={event.id} className={event.kind === "published_anyway" ? "deploy-history-anyway" : undefined}>
                  <td>{when(event.when)}</td>
                  <td>
                    {event.kind === "published_anyway" && <StatusIcon status="fail" />}
                    {event.what}
                  </td>
                  <td>
                    <code>{event.version}</code>
                  </td>
                  <td>{event.reason ?? <span className="deploy-history-nothing">every check passed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

/**
 * What the disabled button says.
 *
 * Named after the rows that are actually stopping it, so the button is the answer rather than a
 * pointer to one — a person who reads only the button still knows what to fix.
 */
function stoppedBy(gate: GateView): string {
  const stopping = gate.rows.filter((row) => row.blocking && row.verdict === "fail");
  if (stopping.length === 0) return "Publishing is stopped";
  if (stopping.length === 1) return `Stopped: ${stopping[0]!.title.toLowerCase()}`;
  return `Stopped by ${stopping.length} of the checks below`;
}

/** The minute, in the shape the rest of the app uses. Times agree across pages or they confuse. */
function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

interface Said {
  ok: boolean;
  says: string;
}

export interface GateRowView {
  kind: string;
  title: string;
  verdict: "pass" | "fail" | "drift" | "info";
  verdictWord: string;
  says: string;
  blocking: boolean;
  blockingWords: string;
}

export interface GateView {
  blocked: boolean;
  rows: GateRowView[];
}

export interface DeployViewProps {
  promptId: string;
  draft: { name: string; when: string; buildHash: string; shortBuild: string };
  live:
    | null
    | {
        name: string;
        when: string;
        buildHash: string;
        shortBuild: string;
        kind: string;
        isSameVersion: boolean;
      };
  gate: GateView;
  history: {
    id: string;
    when: string;
    what: string;
    kind: string;
    version: string;
    reason: string | null;
    shortBuild: string;
  }[];
}
