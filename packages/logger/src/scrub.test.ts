import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { REDACTED, literalSecretMatcher, scrubSecrets, scrubString, secretsFromEnv } from "./scrub";

const ANTHROPIC = "sk-ant-api03-Zq7WcR2mLv9Xb4Nt6Kd1Pf8Hj3Ug5Ay0Se";
const OPENAI = "sk-proj-Tn4Vb8Qw2Ls6Mx1Zc9Rd7Kj3Hg5Yf0Pa";
const GOOGLE = "AIzaSyD9fK2mLpQ7rVx4Nt8Wc1Yd6Fg0Hj5Ul3a";
const OURS = "41p_Xy7Kd2Mn9Pq4Rs6Tv8Wz1Ab3Cd5Ef";

class CollectingStream extends Writable {
  lines: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    this.lines.push(chunk.toString());
    callback();
  }
}

describe("the shapes that are redacted", () => {
  it.each([
    ["an Anthropic key", ANTHROPIC],
    ["an OpenAI key", OPENAI],
    ["a Google key", GOOGLE],
    ["one of our own api keys", OURS],
  ])("redacts %s wherever it appears in a sentence", (_name, secret) => {
    const scrubbed = scrubString(`the call failed with ${secret} — retrying`);
    expect(scrubbed).not.toContain(secret);
    expect(scrubbed).toContain(REDACTED);
    expect(scrubbed).toContain("retrying");
  });

  it("redacts several in one string", () => {
    const scrubbed = scrubString(`${ANTHROPIC} and ${GOOGLE}`);
    expect(scrubbed).toBe(`${REDACTED} and ${REDACTED}`);
  });

  it("takes the password out of a connection URL and leaves the rest readable", () => {
    const scrubbed = scrubString("connecting to postgres://41p:s3cret-p4ssw0rd@db.internal:5432/41p");
    expect(scrubbed).not.toContain("s3cret-p4ssw0rd");
    expect(scrubbed).toContain("db.internal:5432/41p");
    expect(scrubbed).toContain("41p:[redacted]@");
  });
});

/**
 * The other half of a redaction test, and the half that is usually missing: a scrubber that replaced
 * everything would pass every test above and make the logs useless.
 */
describe("what is left alone", () => {
  it.each([
    ["ordinary prose", "the sketch of the plan is ready"],
    ["a short prefix on its own", "sk- was the prefix"],
    ["the letters AIza in a word", "AIza is a prefix, not a key"],
    ["a prompt id", "pr_9f3a1c2b"],
    ["a run id", "run_9f3a1c2b7d4e5f60"],
    ["a commit", "2257a0cfb1d9e4a7"],
    ["an ISO time", "2026-09-16T14:02:11.004Z"],
    ["a plain URL", "https://app.41prompts.ai/app/pr/pr_9f3a1c2b"],
  ])("leaves %s untouched", (_name, text) => {
    expect(scrubString(text)).toBe(text);
  });
});

describe("walking a value", () => {
  it("finds a key nested three deep", () => {
    const scrubbed = scrubSecrets({ job: { payload: { provider: { key: ANTHROPIC } } } });
    expect(JSON.stringify(scrubbed)).not.toContain(ANTHROPIC);
    expect(scrubbed.job.payload.provider.key).toBe(REDACTED);
  });

  it("finds a key inside an array", () => {
    const scrubbed = scrubSecrets(["fine", { headers: ["authorization", `Bearer ${OPENAI}`] }]);
    expect(JSON.stringify(scrubbed)).not.toContain(OPENAI);
  });

  it("finds a key in an error's message and stack, and keeps the error an error", () => {
    const error = new TypeError(`request rejected for ${ANTHROPIC}`);
    const scrubbed = scrubSecrets(error);
    expect(scrubbed).toBeInstanceOf(TypeError);
    expect(scrubbed.message).not.toContain(ANTHROPIC);
    expect(scrubbed.stack ?? "").not.toContain(ANTHROPIC);
  });

  it("follows an error's cause", () => {
    const scrubbed = scrubSecrets(new Error("outer", { cause: new Error(`inner ${GOOGLE}`) }));
    expect(JSON.stringify((scrubbed.cause as Error).message)).not.toContain(GOOGLE);
  });

  it("does not mutate what it was given", () => {
    const original = { key: ANTHROPIC };
    scrubSecrets(original);
    expect(original.key).toBe(ANTHROPIC);
  });

  it("returns a Date and a Buffer as they came rather than copying them into objects", () => {
    const when = new Date("2026-09-16T00:00:00.000Z");
    const bytes = Buffer.from("abc");
    const scrubbed = scrubSecrets({ when, bytes });
    expect(scrubbed.when).toBe(when);
    expect(scrubbed.bytes).toBe(bytes);
  });

  it("stops at a depth cap rather than walking forever", () => {
    // A cycle is the case that matters: a plain recursive walk never returns from this.
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    expect(() => scrubSecrets(cyclic)).not.toThrow();
  });
});

describe("literal secrets, which have no shape at all", () => {
  // The provider-key master key is 43 base64url characters and looks like nothing in particular.
  const MASTER = "Zx7Kd2Mn9Pq4Rs6Tv8Wz1Ab3Cd5EfGh7Ij9Kl1Mn3Op";

  it("is not caught by shape alone — which is why the literal path exists", () => {
    expect(scrubString(`master ${MASTER}`)).toContain(MASTER);
  });

  it("is redacted once its value is known", () => {
    const literals = literalSecretMatcher([MASTER]);
    expect(scrubString(`master ${MASTER}`, literals)).toBe(`master ${REDACTED}`);
  });

  it("reads the names it knows out of an environment, splitting a rotation's comma list", () => {
    const secrets = secretsFromEnv({
      KEY_ENCRYPTION_SECRET: `${MASTER},${MASTER}-second`,
      ANTHROPIC_API_KEY: ANTHROPIC,
      DEPLOY_ENV: "production",
      NOT_A_SECRET: "something",
    });
    expect(secrets).toContain(MASTER);
    expect(secrets).toContain(`${MASTER}-second`);
    expect(secrets).toContain(ANTHROPIC);
    expect(secrets).not.toContain("production");
  });

  it("ignores a value too short to be a secret, so ordinary words are not blanked out", () => {
    expect(literalSecretMatcher(["no"])).toBeUndefined();
    expect(secretsFromEnv({ DEPLOY_ENV: "dev" })).toEqual([]);
  });

  it("redacts the longer of two overlapping secrets whole", () => {
    const literals = literalSecretMatcher(["abcdefgh", "abcdefghijkl"]);
    expect(scrubString("value abcdefghijkl here", literals)).toBe(`value ${REDACTED} here`);
  });
});

/**
 * The assertions that matter, because they are about what actually reaches stdout rather than about
 * the function in isolation. pino keeps the message and the merged object apart, so both are tested.
 */
describe("real pino output", () => {
  function loggerWith(env: Record<string, string | undefined> = {}) {
    const stream = new CollectingStream();
    return { stream, logger: createLogger("scrub-test", stream, { env }) };
  }

  it("redacts a key passed as the message", () => {
    const { stream, logger } = loggerWith();
    logger.info(`calling the provider with ${ANTHROPIC}`);
    expect(stream.lines.join("")).not.toContain(ANTHROPIC);
    expect(stream.lines.join("")).toContain(REDACTED);
  });

  it("redacts a key passed as a field nobody named", () => {
    const { stream, logger } = loggerWith();
    logger.info({ providerCredential: OPENAI }, "starting a run");
    expect(stream.lines.join("")).not.toContain(OPENAI);
  });

  it("redacts a key nested inside a job payload", () => {
    const { stream, logger } = loggerWith();
    // `payload` is on the path list, so this proves the two mechanisms compose rather than fight:
    // whichever runs first, the key is gone.
    logger.info({ job: { data: { config: { anthropic: ANTHROPIC } } } }, "job received");
    expect(stream.lines.join("")).not.toContain(ANTHROPIC);
  });

  it("redacts a key inside an error it was given", () => {
    const { stream, logger } = loggerWith();
    logger.error({ err: new Error(`provider rejected ${GOOGLE}`) }, "run failed");
    expect(stream.lines.join("")).not.toContain(GOOGLE);
  });

  it("redacts the master key's own value, which has no shape to match on", () => {
    const MASTER = "Qw3Er5Ty7Ui9Op1As3Df5Gh7Jk9Lz1Xc3Vb5Nm7Qa9";
    const { stream, logger } = loggerWith({ KEY_ENCRYPTION_SECRET: MASTER });
    logger.info({ note: `sealed under ${MASTER}` }, "stored a key");
    expect(stream.lines.join("")).not.toContain(MASTER);
  });

  it("still logs everything that is not a secret", () => {
    const { stream, logger } = loggerWith();
    logger.info({ runId: "run_9f3a1c2b7d4e5f60", cost: 2 }, "run finished");
    const entry = JSON.parse(stream.lines.join("").trim()) as Record<string, unknown>;
    expect(entry.msg).toBe("run finished");
    expect(entry.runId).toBe("run_9f3a1c2b7d4e5f60");
    expect(entry.cost).toBe(2);
  });
});
