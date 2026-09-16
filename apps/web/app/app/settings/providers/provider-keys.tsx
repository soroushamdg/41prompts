"use client";

import type { ProviderKeyMetadata } from "@41prompts/db";
import { Button, Input, StatusIcon, Switch } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  removeProviderKeyAction,
  saveProviderKeyAction,
  setProviderKeyEnabledAction,
  testProviderKeyAction,
} from "@/lib/providers/actions";

/**
 * One row per provider: paste a key, switch it off, test it, remove it.
 *
 * ## Why the key input is `type="password"` and is never repopulated
 *
 * The field is for **pasting**, never for reading back. Nothing on this page can produce a stored
 * key, so a field showing one would have to be lying; and clearing it after a save is what makes
 * the plaintext's life as short on the client as it is on the server. What comes back afterwards is
 * the last four characters, which is what the provider's own console shows.
 *
 * ## "Checking" is a state, not a spinner over the old answer
 *
 * A stored key is tested by the worker, because opening a sealed envelope is the worker's alone. So
 * the verdict arrives later, and while it is in flight the row says it is checking rather than
 * showing the previous verdict — a stale "works" during a re-check answers a question nobody asked.
 * The poll stops the moment a verdict lands, and it polls only while one is outstanding.
 */

const POLL_MS = 1_500;

export interface ProviderView {
  provider: string;
  /** What a person reads. `title`, not the ADR-003 word. */
  title: string;
  models: string[];
  key: ProviderKeyMetadata | undefined;
}

export function ProviderKeys({ providers }: { providers: ProviderView[] }) {
  const router = useRouter();
  const checking = providers.some((entry) => entry.key?.testRequestedAt != null);

  /**
   * `router.refresh()` asks the server for this route again and swaps it in — no navigation, no
   * reload, nothing on screen thrown away. The same mechanism the run page's progress uses, and for
   * the same reason: a reload would hide whether anything updates by itself.
   */
  useEffect(() => {
    if (!checking) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [checking, router]);

  return (
    <section className="runs-panel" aria-label="Your provider keys">
      <h2>Your keys</h2>
      <p className="runs-note">
        A run uses your key at the provider whose model it is running. Where you have not given us
        one, it uses ours if this deployment has one, and refuses in words if it does not.
      </p>
      <ul className="settings-rows">
        {providers.map((entry) => (
          <ProviderRow key={entry.provider} entry={entry} onDone={() => router.refresh()} />
        ))}
      </ul>
    </section>
  );
}

function ProviderRow({ entry, onDone }: { entry: ProviderView; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const stored = entry.key;

  function run(action: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setMessage(undefined);
    start(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) {
        after?.();
        onDone();
      }
    });
  }

  return (
    <li className="settings-row" data-provider={entry.provider} data-has-key={stored !== undefined}>
      <div className="settings-row-head">
        <span className="settings-row-name">
          <b>{entry.title}</b>
          <span className="settings-row-models">{entry.models.join(" · ")}</span>
        </span>

        {stored !== undefined && (
          <span className="settings-row-state">
            <span className="settings-row-four" data-testid={`last-four-${entry.provider}`}>
              ····{stored.lastFour}
            </span>
            <Switch
              checked={stored.enabled}
              disabled={pending}
              aria-label={`Use your ${entry.title} key`}
              onCheckedChange={(next) => run(() => setProviderKeyEnabledAction(entry.provider, next))}
            />
            <span className="settings-row-switchword">{stored.enabled ? "In use" : "Switched off"}</span>
          </span>
        )}
      </div>

      {stored === undefined ? (
        <form
          className="settings-paste"
          action={() =>
            run(
              () => saveProviderKeyAction(entry.provider, value),
              () => setValue(""),
            )
          }
        >
          <Input
            // Never repopulated, and never readable. See the note at the top of this file.
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label={`${entry.title} API key`}
            placeholder={`Paste your ${entry.title} key`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={pending || value.trim() === ""}>
            Save {entry.title} key
          </Button>
        </form>
      ) : (
        <div className="settings-row-actions">
          <Verdict entry={entry} stored={stored} />
          <Button size="sm" disabled={pending} onClick={() => run(() => testProviderKeyAction(entry.provider))}>
            Test {entry.title} key
          </Button>
          <Button size="sm" disabled={pending} onClick={() => run(() => removeProviderKeyAction(entry.provider))}>
            Remove {entry.title} key
          </Button>
        </div>
      )}

      {message !== undefined && (
        <p className="app-form-message" role="alert" data-testid={`message-${entry.provider}`}>
          {message}
        </p>
      )}
    </li>
  );
}

/**
 * What the last test said, in words and with a glyph — **never by colour alone** (rule 10).
 *
 * "Never checked" is its own state and is not painted as a failure: a key that verified at the
 * moment it was stored and has not been re-tested since has not failed anything.
 */
function Verdict({ entry, stored }: { entry: ProviderView; stored: ProviderKeyMetadata }) {
  if (stored.testRequestedAt != null) {
    return (
      <span className="settings-verdict" role="status" data-testid={`verdict-${entry.provider}`}>
        Checking with {entry.title}…
      </span>
    );
  }
  if (stored.lastTestOk === null) {
    return (
      <span className="settings-verdict" data-testid={`verdict-${entry.provider}`}>
        {entry.title} accepted this key when you stored it. Not re-checked since.
      </span>
    );
  }
  return (
    <span
      className="settings-verdict"
      data-status={stored.lastTestOk ? "pass" : "fail"}
      data-testid={`verdict-${entry.provider}`}
    >
      <StatusIcon status={stored.lastTestOk ? "pass" : "fail"} />
      {stored.lastTestOk
        ? `${entry.title} answered. This key works.`
        : (stored.lastTestDetail ?? `${entry.title} did not accept this key.`)}
    </span>
  );
}
