import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { enabledProviders, safeNext } from "@/lib/auth";
import { PRICING_ENABLED } from "@/lib/env";
import { siteUrl } from "@/lib/hosts";
import { getSession } from "@/server/session";
import { MarkSheet } from "./mark-sheet";
import { SignInForm } from "./sign-in-form";
import s from "./sign-in.module.css";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; via?: string }> }) {
  const { next, error, via } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);
  return (
    <div className={s.auth}>
      <section className={`${s.form} app-bg`}>
        <Logo href={siteUrl("/")} label="41Prompts, home" size={21} />
        <SignInForm next={target} error={error ? { via: via === "oauth" ? "oauth" : "link" } : undefined} providers={enabledProviders()} pricingEnabled={PRICING_ENABLED} />
      </section>
      <MarkSheet />
    </div>
  );
}
