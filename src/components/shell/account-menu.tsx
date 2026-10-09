"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Menu } from "@/components/menu";
import { setAnalyticsSink } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { clearLocalDrafts } from "@/lib/drafts";
import { siteUrl } from "@/lib/hosts";
import { PH_REVIEW_URL } from "@/lib/product-hunt";
import { initialFor } from "@/lib/user";

export async function signOutEverywhere() {
  clearLocalDrafts();
  await authClient.signOut().catch(() => null);
  setAnalyticsSink(null);
  // A full load, so no signed-in page stays in the client router cache.
  window.location.replace(new URL("/sign-in", window.location.origin));
}

export function AccountMenu({ name, email }: { name: string; email: string }) {
  return (
    <Menu summary={initialFor(name, email)} summaryClassName="avatar" summaryLabel="Account menu">
      <div className="menu__who">
        <b>{name || email.split("@")[0]}</b>
        <span>{email}</span>
      </div>
      <Link href="/settings#keys"><Icon name="key" />Model keys</Link>
      <Link href="/settings#billing"><Icon name="card" />Plan and billing</Link>
      <a href={siteUrl("/")}><Icon name="external" />41prompts.ai</a>
      <a href={PH_REVIEW_URL} target="_blank" rel="noopener noreferrer"><Icon name="share" />Review on Product Hunt</a>
      <button type="button" onClick={signOutEverywhere}><Icon name="logout" />Sign out</button>
    </Menu>
  );
}
