import type { Metadata } from "next";
import { deleteAccountAction } from "@/lib/account-actions";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Delete account — 41Prompts", robots: { index: false, follow: false } };

// The confirmation step decision 5 calls for: a destructive action needs its own page and its
// own explicit submit, not a one-click button on the account page.
export default async function DeleteAccountPage() {
  const session = await requireSession("/app/account/delete");

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <h1>Delete account</h1>
      </header>
      <p>
        This deletes {session.user.email} and everything owned by it. There is no way to undo
        this from the product.
      </p>
      <ul className="app-list">
        <li>
          <form action={deleteAccountAction}>
            <button className="app-list-action" type="submit">
              Delete my account
            </button>
          </form>
        </li>
        <li>
          <a href="/app/account">Cancel</a>
        </li>
      </ul>
    </main>
  );
}
