import { openEnabledProviderKey, providerOfModel, type Db, type ProviderName } from "@41prompts/db";
import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";
import { ANSWERED, JUDGE_MODEL, REFUSED } from "./judge";
import { openaiProvider } from "./openai";
import type { Provider } from "./execute";

/**
 * Which provider this process has, if any.
 *
 * ## `undefined` is an answer, not an error
 *
 * With no key there is no honest run. Throwing would reach the person as a job that died and a page
 * that never finishes; `undefined` becomes `provider_not_configured`, which is a sentence they can
 * read. EPIC-031 made refusal a typed outcome with three named reasons precisely so a fourth could
 * be added here rather than becoming a crash.
 *
 * ## The fake, and why it is allowed to exist in this file
 *
 * The e2e suite has to prove two things that cannot both be true of one process: that a run with no
 * provider is refused **in words**, and that a run with a provider produces results by check. So
 * the suite starts this worker twice, with different environments, and `FAKE_PROVIDER=1` selects a
 * deterministic echo instead of a network call.
 *
 * Three guards, because a test-only path in production code is exactly the shape that goes wrong:
 *
 * 1. It is **off unless the flag is set**, and the flag exists nowhere in `infra/`.
 * 2. It is **refused outright in production**, whatever the flag says.
 * 3. It is **announced**, by the caller, in the startup log — a process answering with a fake must
 *    never be quiet about it.
 */
export interface SelectedProvider {
  readonly provider: Provider;
  /** For the startup log. Never a key, never a fragment of one. */
  readonly name: string;
}

/**
 * How `runSuite` asks for a provider, so a test can answer without a database (EPIC-042).
 *
 * It takes the **owner and the model**, not a provider name, because "whose key" and "which model"
 * are the two facts that decide the answer and the provider name is derived from the second. A
 * resolver taking a provider name would let a caller ask for an Anthropic adapter for a Gemini
 * model, which is a sentence that should not be expressible.
 */
export type SelectProvider = (input: { owner: string; model: string }) => Promise<SelectedProvider | undefined>;

/** The three environment variables a deployment's own keys live in, by provider. */
const ENV_KEY_NAME: Readonly<Record<ProviderName, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

const ADAPTERS: Readonly<Record<ProviderName, (apiKey: string) => Provider>> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
};

/**
 * The environment this function reads, named rather than taken as the whole of `process.env`.
 *
 * `NodeJS.ProcessEnv` was the obvious type and is the wrong one here twice over: it is an ambient
 * namespace ESLint's `no-undef` does not know about, and it says "every variable this process has"
 * when the answer is three. A caller passing `{ FAKE_PROVIDER: "1" }` should not have to cast.
 */
export interface ProviderEnv {
  readonly FAKE_PROVIDER?: string | undefined;
  readonly FAKE_JUDGE?: string | undefined;
  readonly DEPLOY_ENV?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly OPENAI_API_KEY?: string | undefined;
  readonly GOOGLE_API_KEY?: string | undefined;
  /**
   * The names above are the whole of what this module reads from the environment, written out so
   * that is legible. The index signature is what lets `process.env` be passed: without it TypeScript
   * rejects the call as a weak type with no properties in common, which is a true statement about
   * an environment that has none of them set and a useless one here.
   *
   * `KEY_ENCRYPTION_SECRET` is read too, by `openEnabledProviderKey`, and is deliberately **not**
   * named here — nothing in this file should be in a position to hold it.
   */
  readonly [name: string]: string | undefined;
}

export function providerFor(env: ProviderEnv = process.env): SelectedProvider | undefined {
  const fakeJudge = env.FAKE_JUDGE === "1" && env.DEPLOY_ENV !== "production";

  if (env.FAKE_PROVIDER === "1" && env.DEPLOY_ENV !== "production") {
    const name = fakeJudge
      ? "deterministic fake + fake judge (FAKE_PROVIDER=1, FAKE_JUDGE=1) — no model is called"
      : "deterministic fake (FAKE_PROVIDER=1) — no model is called";
    return { provider: withFakeJudge(echoLastLineProvider(), fakeJudge), name };
  }

  const keyForFakeJudge = env.ANTHROPIC_API_KEY;
  if (fakeJudge && typeof keyForFakeJudge === "string" && keyForFakeJudge.length > 0) {
    // A real model under test with a fake judge over it: the combination that lets a test choose a
    // verdict while the thing being judged is genuinely a model's reply.
    return {
      provider: withFakeJudge(anthropicProvider(keyForFakeJudge), true),
      name: "anthropic, with a fake judge (FAKE_JUDGE=1)",
    };
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (typeof apiKey === "string" && apiKey.length > 0) {
    return { provider: anthropicProvider(apiKey), name: "anthropic" };
  }

  return undefined;
}

/**
 * The fake: it answers with the **last non-empty line of the prompt it was given**.
 *
 * Deterministic, and deterministic in a way a test can steer: the compiled prompt ends with a blok
 * the test wrote, that blok carries a `{{variable}}`, and the variable's value comes from the CSV.
 * So the answer is the bound value — which makes this fake prove the binding end to end rather than
 * merely stand in for a model.
 *
 * It reports token counts so the cost path is exercised for real: a run through the fake spends a
 * real number of cents against a real budget, and a re-run of it is answered by the cache at zero.
 */
export function echoLastLineProvider(): Provider {
  return {
    async complete({ prompt }) {
      const lines = prompt.split("\n").filter((line) => line.trim() !== "");
      const text = lines[lines.length - 1] ?? "";
      return {
        text,
        inputTokens: Math.ceil(prompt.length / 4) + 1,
        outputTokens: Math.ceil(text.length / 4) + 1,
        raw: { provider: "fake", echoed: "the last non-empty line of the prompt" }
      };
    }
  };
}

/**
 * The token that steers the fake judge. It appears in no real model's output and in no real prompt.
 */
export const FAKE_JUDGE_REFUSAL_TOKEN = "<<refuses>>";

/**
 * Wrap a provider so that calls to the **judge model** are answered by a fake verdict.
 *
 * ## Why the fake is steered by a token rather than by reading the reply
 *
 * The obvious fake would look at the reply and answer `REFUSED` when it starts with "I cannot". That
 * is a phrase list — the exact thing `graders.ts` refuses to ship and the reason this epic exists —
 * and a suite that used it would be proving the judge works by consulting the heuristic the judge
 * replaces. So the fake answers on a token that nothing real emits: a test puts
 * `FAKE_JUDGE_REFUSAL_TOKEN` in the output it wants judged a refusal, and gets one.
 *
 * What the e2e then proves is the **pipeline** — the verdict maps to an outcome, the rationale is
 * stored and rendered, the cost is counted separately — and not that a model is clever. The report
 * says so rather than letting a green suite imply more.
 *
 * Only judge calls are intercepted. Everything else falls through to the wrapped provider, so the
 * thing under test is whatever it would otherwise have been.
 */
export function withFakeJudge(provider: Provider, enabled: boolean): Provider {
  if (!enabled) return provider;
  return {
    async complete(request) {
      if (request.model !== JUDGE_MODEL) return provider.complete(request);

      const refused = request.prompt.includes(FAKE_JUDGE_REFUSAL_TOKEN);
      const text = [
        refused ? REFUSED : ANSWERED,
        refused
          ? "The reply declines to engage with what was asked."
          : "The reply engages with what was asked.",
      ].join("\n");

      return {
        text,
        inputTokens: Math.ceil(request.prompt.length / 4) + 1,
        outputTokens: Math.ceil(text.length / 4) + 1,
        raw: { provider: "fake-judge", steeredBy: FAKE_JUDGE_REFUSAL_TOKEN },
      };
    },
  };
}

/**
 * The provider for **one owner's run of one model** — the key they brought, or ours, or nothing.
 *
 * ## The order, and why each step is where it is
 *
 * 1. **The fake**, when `FAKE_PROVIDER=1` and this is not production. Unchanged from `providerFor`
 *    and first for the same reason: a process answering with a fake must do so consistently, and a
 *    fake that a stored key could override would make the e2e suite depend on the contents of a
 *    database table.
 * 2. **A model nobody prices does not resolve to a provider.** `providerOfModel` returning
 *    `undefined` means the catalogue does not have it; `executeRun` would refuse it anyway with
 *    `model_not_priced`, and returning a provider for it here would be building an adapter for a
 *    call that is about to be refused.
 * 3. **The owner's own key, if they have one and have not switched it off.** This is the whole
 *    point of the epic. Opening it stamps `last_used_at`.
 * 4. **The deployment's key**, from the environment. This is what every run used before today.
 * 5. **`undefined`**, which becomes `provider_not_configured` — a sentence, not a crash.
 *
 * ## A failure to open is not a silent fall-through to our key
 *
 * If a person has a key and the master key cannot open it, `openEnabledProviderKey` throws and this
 * lets it. **Quietly running their prompt on the platform's key instead would spend our money
 * against their intent** and would hide a real incident — a master key that has gone missing — behind
 * a run that worked. The job fails, which is what an incident should look like.
 */
export async function providerForRun(
  db: Db,
  input: { owner: string; model: string },
  env: ProviderEnv = process.env,
): Promise<SelectedProvider | undefined> {
  const fake = fakeProviderFrom(env);
  if (fake !== undefined) return fake;

  const provider = providerOfModel(input.model);
  if (provider === undefined) return undefined;

  const brought = await openEnabledProviderKey(db, input.owner, provider, env);
  if (brought !== undefined) {
    return { provider: withFakeJudge(ADAPTERS[provider](brought), wantsFakeJudge(env)), name: `${provider} (your key)` };
  }

  const ours = env[ENV_KEY_NAME[provider]];
  if (typeof ours === "string" && ours.length > 0) {
    return { provider: withFakeJudge(ADAPTERS[provider](ours), wantsFakeJudge(env)), name: provider };
  }

  return undefined;
}

/**
 * Which providers this owner could run against right now, in catalogue order.
 *
 * Used by nothing in the worker — `apps/web` has its own read, because it must not open anything to
 * answer the question and does not need to. It is here so the two definitions of "available" cannot
 * drift: available means **a stored, enabled key, or one of ours**.
 */
export function deploymentProviders(env: ProviderEnv = process.env): readonly ProviderName[] {
  return (Object.keys(ENV_KEY_NAME) as ProviderName[]).filter((provider) => {
    const value = env[ENV_KEY_NAME[provider]];
    return typeof value === "string" && value.length > 0;
  });
}

function wantsFakeJudge(env: ProviderEnv): boolean {
  return env.FAKE_JUDGE === "1" && env.DEPLOY_ENV !== "production";
}

/** The fake, and the three guards on it, in one place so both selectors share them exactly. */
function fakeProviderFrom(env: ProviderEnv): SelectedProvider | undefined {
  if (env.FAKE_PROVIDER !== "1" || env.DEPLOY_ENV === "production") return undefined;
  const fakeJudge = wantsFakeJudge(env);
  const name = fakeJudge
    ? "deterministic fake + fake judge (FAKE_PROVIDER=1, FAKE_JUDGE=1) — no model is called"
    : "deterministic fake (FAKE_PROVIDER=1) — no model is called";
  return { provider: withFakeJudge(echoLastLineProvider(), fakeJudge), name };
}
