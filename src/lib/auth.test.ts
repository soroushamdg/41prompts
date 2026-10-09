import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { user } from "@/db/schema";
import { testDb } from "@/test/db";
import { createAuth, safeNext } from "./auth";

/* Better Auth end to end on in-process Postgres: the magic link works once,
   creates the account, and nothing a client sends can change the plan. */

let db: Db;
let close: () => Promise<void>;
const sent: Array<{ email: string; link: string }> = [];
let auth: ReturnType<typeof createAuth>;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0000";
  ({ db, close } = await testDb());
  auth = createAuth({ db, sendLink: async (email, link) => void sent.push({ email, link }) });
});
afterAll(() => close());

async function signIn(email: string) {
  await auth.api.signInMagicLink({ body: { email, callbackURL: "/" }, headers: new Headers() });
  const { link } = sent.at(-1)!;
  const u = new URL(link);
  expect(u.pathname).toBe("/sign-in/verify");
  const token = u.searchParams.get("token")!;
  return auth.api.magicLinkVerify({ query: { token }, headers: new Headers(), returnHeaders: true });
}

describe("magic link", () => {
  it("emails an interstitial link, signs up on first use, and works only once", async () => {
    const first = await signIn("new@example.test");
    expect(first.response?.user.email).toBe("new@example.test");
    const [row] = await db.select().from(user).where(eq(user.email, "new@example.test"));
    expect(row?.plan).toBe("free");
    expect(row?.emailVerified).toBe(true);

    const token = new URL(sent.at(-1)!.link).searchParams.get("token")!;
    await expect(auth.api.magicLinkVerify({ query: { token }, headers: new Headers() })).rejects.toBeTruthy();
  });

  it("never lets a client set the plan", async () => {
    const { headers } = await signIn("plan@example.test");
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    await auth.api.updateUser({ body: { name: "Plan", plan: "performance" } as never, headers: new Headers({ cookie }) }).catch(() => null);
    const [row] = await db.select().from(user).where(eq(user.email, "plan@example.test"));
    expect(row?.plan).toBe("free");
  });
});

describe("safeNext", () => {
  it("keeps relative paths and drops everything else", () => {
    expect(safeNext("/p/x?v=2")).toBe("/p/x?v=2");
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("/\\evil.test")).toBe("/");
    expect(safeNext(null, "/settings")).toBe("/settings");
  });
});
