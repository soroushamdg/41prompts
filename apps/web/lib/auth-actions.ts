"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { safeNextPath } from "./next-url";

async function signInWithProvider(provider: "google" | "github", formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next")?.toString());
  const result = await getAuth().api.signInSocial({
    body: { provider, callbackURL: next },
    headers: await headers(),
  });
  redirect(result.url ?? next);
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  await signInWithProvider("google", formData);
}

export async function signInWithGitHubAction(formData: FormData): Promise<void> {
  await signInWithProvider("github", formData);
}

export async function sendMagicLinkAction(formData: FormData): Promise<void> {
  const email = formData.get("email")?.toString() ?? "";
  const next = safeNextPath(formData.get("next")?.toString());

  let errorMessage: string | null = null;
  try {
    await getAuth().api.signInMagicLink({
      body: { email, callbackURL: next },
      headers: await headers(),
    });
  } catch (error) {
    errorMessage =
      error instanceof APIError ? (error.body?.message ?? "Something went wrong.") : "Something went wrong.";
  }

  const params = new URLSearchParams({ next });
  if (errorMessage) {
    params.set("error", errorMessage);
  } else {
    params.set("sent", "1");
  }
  redirect(`/sign-in?${params.toString()}`);
}
