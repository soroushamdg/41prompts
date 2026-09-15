import { anthropicProvider } from "./anthropic";
import { ANSWERED, JUDGE_MODEL, REFUSED } from "./judge";
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
  /**
   * The three names above are the whole of what this function reads, written out so that is
   * legible. The index signature is what lets `process.env` be passed: without it TypeScript
   * rejects the call as a weak type with no properties in common, which is a true statement about
   * an environment that has none of the three set and a useless one here.
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
