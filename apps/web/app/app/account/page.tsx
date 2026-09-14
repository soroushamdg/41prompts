import type { Metadata } from "next";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Account — 41Prompts" };

export default async function AccountPage() {
  const session = await requireSession("/app/account");

  return (
    <main>
      <h1>Account</h1>
      <p>{session.user.email}</p>
      <p>
        <a href="/app/account/delete">Delete account</a>
      </p>
      <p>
        <a href="/app/projects">Back</a>
      </p>
    </main>
  );
}
