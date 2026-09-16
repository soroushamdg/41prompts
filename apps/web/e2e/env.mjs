/**
 * **The configuration a local suite needs, in one place, because there were already three.**
 *
 * `apps/web`'s auth path constructs Better Auth at startup, which wants a URL, a signing secret and
 * a provider pair before it will serve a sign-in. Nothing loads the repo's root `.env` into a Node
 * process — no `apps/web/.env` exists and nothing sources it — so a fresh shell running `pnpm e2e`
 * gets none of them, every magic-link sign-in returns **"Something went wrong."**, and eleven tests
 * fail with no statement anywhere of what was missing. Proved on 2026-09-14: `auth.spec.ts` went
 * from 8 failed to 10 passed with only the values below added and nothing else changed.
 *
 * That is the failure mode `gates.mjs` exists to remove — "no database here" must never be
 * indistinguishable from "this code is broken" — arriving through the one door it did not cover.
 * It matters beyond the annoyance: the unattended runner treats an unexplained failure as a
 * blocker and stops, so this defect parks the loop on its first epic.
 *
 * **These are the values `.github/workflows/ci.yml` sets, and this file is now the only copy.**
 * They were written out three times — `ci.yml`, `gates.mjs`'s `test` task, and `gates.mjs`'s CI
 * mode — and a copy goes stale silently, which is the whole argument of `gate-run.mjs` one level
 * up. `ci.yml` keeps its own literal because a workflow cannot import this; the two are pinned
 * together by `apps/web/e2e-env.test.ts`.
 *
 * **They are placeholders and never credentials.** Nothing in the suite drives a real OAuth round
 * trip, and the magic-link tests read their token straight from the database.
 *
 * **Why `.mjs` in a TypeScript app, and why here.** `scripts/gates.mjs` is plain Node with no
 * transpiler in front of it, so it cannot import a `.ts` file — the shared module has to be
 * JavaScript. And it has to live inside `apps/web`, not `scripts/`, because the test that guards it
 * belongs to the package that owns the e2e suite and `turbo boundaries` refuses an import that
 * leaves a package. The root — `playwright.config.ts` and `scripts/` — is not boundary-checked, so
 * it may reach in; `apps/web` may not reach out. That asymmetry is what put the file at this path.
 */

/**
 * The published, worthless provider-key master key (EPIC-042).
 *
 * **Both halves of one key, deliberately, and they are handed out separately.** `apps/web` gets the
 * public half and can seal; `apps/worker` gets the secret and can open. That is threat-model row
 * `043a`'s split, and the e2e suite runs under it rather than under a shape nothing deploys — so
 * the suite proves the web never needs the secret instead of taking it on trust.
 *
 * It is defined in `packages/db/src/sealed-box.ts` as `PLACEHOLDER_MASTER_SECRET` and
 * `PLACEHOLDER_MASTER_PUBLIC`, and `masterKeysFrom` **refuses it outright when `DEPLOY_ENV` is
 * production** — because a published key is safe exactly until somebody pastes it into a
 * deployment. `apps/web/e2e-env.test.ts` pins these two copies together, the same way it pins this
 * file to `ci.yml`.
 */
export const MASTER_KEY_SECRET = "0NKZT1nc-uRye9d-XTkKNCOi4wZM1GRl8MT-63Dme3I";
export const MASTER_KEY_PUBLIC = "41vjBsKfqrgm9bHOtiIRzRhghpgINayaq3tKn74Zh0w";

/** The placeholder configuration, for a suite driving `port`. */
export function placeholders(port = 3000) {
  return {
    DEPLOY_ENV: "development",
    BETTER_AUTH_SECRET: "ci-secret-not-for-prod-0123456789",
    // Better Auth refuses a request whose origin does not match this, which is how three auth tests
    // failed across EPIC-014 to EPIC-016 while being reported as environmental. Derived from the
    // port rather than fixed, so changing the port cannot reintroduce it.
    BETTER_AUTH_URL: `http://localhost:${port}`,
    GOOGLE_CLIENT_ID: "ci-google-client-id",
    GOOGLE_CLIENT_SECRET: "ci-google-client-secret",
    GITHUB_CLIENT_ID: "ci-github-client-id",
    GITHUB_CLIENT_SECRET: "ci-github-client-secret",
    // The web seals and never opens (EPIC-042). The public half is all it needs, and giving it only
    // that is what makes the suite a test of the split rather than a test beside it.
    KEY_ENCRYPTION_PUBLIC_KEY: MASTER_KEY_PUBLIC,
  };
}

/**
 * What no placeholder can stand in for.
 *
 * A signing secret can be invented because nothing verifies it against anything. A database cannot:
 * inventing a URL would move the failure rather than remove it, and would land it somewhere further
 * from its cause. So this one is named and refused rather than guessed.
 */
export const REQUIRED = [
  {
    name: "DATABASE_URL",
    why: "the suite reads its magic-link token out of the verifications table, so there is no run without one",
    fixes: [
      "node scripts/gates.mjs ci        # starts its own throwaway Postgres and sets everything",
      "",
      "or, for a suite you drive by hand — port 55435 deliberately, because 55432 and 55433",
      "are the throwaway containers `gates.mjs` starts for `test` and for `ci`:",
      "",
      "docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \\",
      "  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16",
      "export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate",
    ],
  },
];

/** The required names `env` does not supply. Empty means the suite can start. */
export function missingRequired(env) {
  return REQUIRED.filter(({ name }) => env[name] === undefined || env[name] === "");
}

/**
 * Set each of `values` on `env` **only where it is unset**, and return the names actually set.
 *
 * Only-when-unset is the point: a real local `.env`, an exported `DATABASE_URL`, or CI's own block
 * always wins. This fills a hole; it never takes a decision away from whoever made one.
 *
 * The return value exists so the caller can say what it did. Injecting a signing secret in silence
 * would be a smaller version of the defect this file removes — the run would be correct and the
 * reason would still be invisible.
 */
export function applyWhenUnset(env, values) {
  const applied = [];
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined || env[key] === "") {
      env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

/** The refusal, as the lines to print. Kept here so it is testable without a Playwright run. */
export function refusalLines(missing) {
  const lines = [
    "",
    "pnpm e2e cannot start, and will not start misleadingly:",
    "",
  ];
  for (const { name, why, fixes } of missing) {
    lines.push(`  ${name} is not set — ${why}.`, "");
    for (const fix of fixes) lines.push(`    ${fix}`);
    lines.push("");
  }
  lines.push(
    "Everything else the suite needs is a placeholder and is filled in automatically;",
    "this one cannot be invented without moving the failure somewhere further from its cause.",
    ""
  );
  return lines;
}
