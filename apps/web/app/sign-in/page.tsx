import type { Metadata } from "next";
import { safeNextPath } from "@/lib/next-url";
import { SignInForm } from "../sign-in-form";

export const metadata: Metadata = { title: "Sign in — 41Prompts" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <SignInForm
      heading="Sign in"
      sub="Welcome back."
      alt={{ question: "No account?", name: "Create one", href: "/sign-up" }}
      next={next}
      sent={sent}
      error={error}
    />
  );
}
