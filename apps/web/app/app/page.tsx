import type { Metadata } from "next";
import { signOutAction } from "@/lib/account-actions";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "41Prompts" };

export default async function AppHomePage() {
  const session = await requireSession("/app");

  return (
    <main>
      <p>Signed in as {session.user.email}</p>
      <form action={signOutAction}>
        <button type="submit">Sign out</button>
      </form>
      <p>
        <a href="/app/account">Account</a>
      </p>
    </main>
  );
}
