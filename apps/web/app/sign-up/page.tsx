import type { Metadata } from "next";
import { safeNextPath } from "@/lib/next-url";
import { SignInForm } from "../sign-in-form";

export const metadata: Metadata = { title: "Create your account — 41Prompts" };

// Sign-up and sign-in are mechanically the same flow (decision 2): Google, GitHub, and
// magic-link all create the account on first use, so there is no separate registration step
// to build. This page exists as its own route because a new visitor looks for "sign up", not
// "sign in" — the copy differs, nothing else does.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? params.error : undefined;

  return <SignInForm heading="Create your account" next={next} sent={sent} error={error} />;
}
