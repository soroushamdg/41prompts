import type { Metadata } from "next";
import { unsubscribeFromWaitlist } from "@/app/decompile/share-actions";

/**
 * The unsubscribe path the waitlist promises.
 *
 * **No confirmation step and no account.** Decision 8 requires an unsubscribe path; making somebody
 * prove who they are in order to stop hearing from us would be the wrong way round, and an extra
 * click on an unsubscribe page is the internet's most resented pattern. Following the link is the
 * act of unsubscribing.
 *
 * The consequence is worth stating rather than hiding: anyone who knows an address can unsubscribe
 * it. For a list whose only purpose is to send one email about an editor shipping, being wrongly
 * removed costs someone a notification, and being unable to leave costs them their patience. The
 * trade only holds while that is all the list does — a list that ever carried anything else would
 * need a signed token.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribed · 41Prompts",
  robots: { index: false, follow: false }
};

export default async function UnsubscribePage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const address = typeof email === "string" ? email.trim() : "";
  if (address.length > 0) await unsubscribeFromWaitlist(address);

  return (
    <main className="decompile" id="main">
      <header className="decompile-head">
        <h1>Unsubscribed.</h1>
        <p>
          {address.length > 0
            ? "You will not hear from me about the editor. Nothing else was stored about you, and there is nothing else to unsubscribe from."
            : "There was no address in that link, so nothing changed. If you are still getting email, reply to it and I will remove you by hand."}
        </p>
      </header>
    </main>
  );
}
