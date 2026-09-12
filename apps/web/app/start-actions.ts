"use server";

import { redirect } from "next/navigation";
import { put } from "@/lib/landing/handoff";

/**
 * The landing page's ask bar.
 *
 * It does one thing: take what the reader pasted and get them to `/decompile` looking at it. No
 * account, no email, no interstitial — the proof is one paste away and nothing may stand between
 * them and it (epic decision 2).
 *
 * **The text never enters the URL.** It goes into a single-use in-process handoff and an opaque id
 * travels instead; `lib/landing/handoff.ts` has the full reasoning, but the short version is that a
 * prompt in a query string ends up in browser history, in the `Referer` of any outbound click, in
 * proxy logs and eventually in analytics — on a page whose own copy says the prompt is not saved.
 *
 * Works with JavaScript off: this is a plain Server Action on a plain `<form>`, so the browser posts
 * it and follows the redirect on its own.
 */
export async function startDecompile(formData: FormData): Promise<void> {
  const raw = formData.get("prompt");
  const text = typeof raw === "string" ? raw : "";

  // Nothing pasted is not an error and not a message — it is just the decompiler, empty, with its
  // own box waiting. Sending them to a landing-page error state would be punishing a mis-click.
  if (text.trim().length === 0) redirect("/decompile");

  // Deliberately no size check here. An oversized paste is refused by `runDecompile` with a message
  // that names the limit and what they actually sent; checking it twice would mean two ways to say
  // the same no, and only one of them maintained.
  redirect(`/decompile?start=${put(text)}`);
}
