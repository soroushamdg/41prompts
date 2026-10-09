import type { Metadata } from "next";
import { appUrl } from "@/lib/hosts";
import { Clause, ContactLine, LegalPage } from "../_landing/legal-page";

export const metadata: Metadata = {
  title: "Terms · 41prompts",
  description: "The terms for using 41prompts, the workbench for the prompt layer, written in plain words.",
};

/* A plain-language draft for the owner to review before launch. It describes
   what the product does today and keeps its promises small. */
export default function TermsPage() {
  return (
    <LegalPage
      sheet="Sheet L01"
      eyebrow="Legal · Terms"
      title="Terms of use"
      lede="The rules for using 41prompts, in plain words. By creating an account you agree to them. If something here is unclear, ask us before you rely on it."
    >
      <Clause n={1} title="What 41prompts is">
        <p>
          41prompts is a workbench for writing, versioning and testing prompts for language models. These terms cover the website at 41prompts.ai and the app at{" "}
          <a href={appUrl("/")}>app.41prompts.ai</a>.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <p>
          You sign in with a link sent to your email, or with Google or GitHub. Keep access to that email address or account safe, because anyone who controls it can sign in as
          you. A sign-in lasts 30 days on each device.
        </p>
        <p>An account is for one person. You need to be old enough to agree to these terms where you live.</p>
      </Clause>

      <Clause n={3} title="Your prompts stay yours">
        <p>
          The prompts, bloks, versions and test results you create belong to you. We store them only to run 41prompts for you. They are private: nobody else can see them unless you
          publish a share page, which you can take down at any time.
        </p>
        <p>We do not sell your content and we do not use it to train models.</p>
      </Clause>

      <Clause n={4} title="Model keys and runs">
        <p>
          When you run a prompt, 41prompts sends it to the provider you choose (OpenAI, Anthropic or Google) with your own API key. That provider&rsquo;s terms apply to the
          request, and the provider bills your account directly. We do not control what a model returns, whether a provider is available, or what it charges.
        </p>
      </Clause>

      <Clause n={5} title="Plans and payment">
        <p>The Free plan costs nothing and has no limits on prompts, bloks or versions.</p>
        <p>
          Performance is a paid plan. When it is on sale, payment goes through Stripe Checkout with Managed Payments. Stripe, through Link, is the merchant of record: it takes the
          payment and handles tax, receipts and refunds. You can cancel at any time from the billing portal, and you keep everything you made on Free.
        </p>
      </Clause>

      <Clause n={6} title="Fair use">
        <ul>
          <li>Do not use 41prompts to break the law or to harm other people.</li>
          <li>Do not try to reach other people&rsquo;s data, or to overload, probe or get around the limits of the service.</li>
          <li>Do not publish share pages with content you have no right to share.</li>
        </ul>
        <p>We may suspend an account that does these things. Where we can, we will tell you why first.</p>
      </Clause>

      <Clause n={7} title="Export and deletion">
        <p>
          You can export everything at any time, as Markdown and JSON in one .zip file. Deleting your account removes your prompts, versions, keys and sign-ins straight away. A
          prompt you delete on its own is removed for good by a daily cleanup once it has been deleted for 24 hours.
        </p>
      </Clause>

      <Clause n={8} title="No guarantees">
        <p>
          We work to keep 41prompts running and your data safe, but the service is provided as it is, without warranties. As far as the law allows, we are not liable for indirect
          losses, or for what a model says or does with your prompts.
        </p>
      </Clause>

      <Clause n={9} title="Changes to these terms">
        <p>If these terms change, we will update this page and the date at the bottom of it. If a change affects how your data is handled, we will also tell you by email.</p>
      </Clause>

      <Clause n={10} title="Contact">
        <ContactLine topic="these terms" />
      </Clause>
    </LegalPage>
  );
}
