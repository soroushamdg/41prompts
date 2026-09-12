import type { Metadata } from "next";
import { SiteFooter, SiteNavWithSession } from "../site-chrome";

export const metadata: Metadata = {
  title: "Contact · 41Prompts",
  description: "How to reach 41Prompts.",
  alternates: { canonical: "/contact" },
  robots: { index: false, follow: true }
};

/**
 * Deliberately not a form and not a `mailto:` to an address nobody reads yet.
 *
 * A contact page's only job is to be true. There is one channel that actually works today — the
 * waitlist on the decompiler — so that is what this says, rather than inventing a support address
 * that would bounce.
 */
export default function ContactPage() {
  return (
    <>
      <SiteNavWithSession />
      <main className="prose-page" id="main">
        <h1>Contact</h1>
        <p>
          <strong>There is no support address yet.</strong> Pretending otherwise would mean handing
          you one that bounces.
        </p>
        <p>
          The one channel that works today is the list at the bottom of{" "}
          <a href="/decompile">the decompiler</a>. Leave an email there and it reaches a person. You
          can unsubscribe from anything sent to it.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
