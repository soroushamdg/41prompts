import type { Metadata } from "next";
import { Clause, ContactLine, LegalPage } from "../_landing/legal-page";

export const metadata: Metadata = {
  title: "Privacy · 41prompts",
  description: "What 41prompts stores, why, who helps run it, and how to export or delete everything.",
};

/* A plain-language draft for the owner to review before launch. Every line
   describes what the product does today. */
export default function PrivacyPage() {
  return (
    <LegalPage
      sheet="Sheet L02"
      eyebrow="Legal · Privacy"
      title="Privacy"
      lede="What we keep, why we keep it, and who helps us run 41prompts. The short version: your prompts are private, your keys are encrypted, and you can take everything with you or delete it."
    >
      <Clause n={1} title="What we store">
        <ul>
          <li>
            <b>Your account.</b> Your email address, and your name and picture if you sign in with Google or GitHub.
          </li>
          <li>
            <b>Your work.</b> Prompts, bloks, versions and test results.
          </li>
          <li>
            <b>Your models.</b> The label, provider, model name, address and prices of each model you add, and its key, encrypted, as described below.
          </li>
          <li>
            <b>Your plan.</b> Whether you are on Free or Performance, and a reference to your Stripe customer record if you pay.
          </li>
        </ul>
        <p>All of it lives in a Postgres database hosted by Neon, through Vercel.</p>
      </Clause>

      <Clause n={2} title="Your prompts are private">
        <p>
          Every prompt and version is visible only to you. Nothing becomes public unless you publish a share page, and you can take that page down at any time. We do not sell your
          content and we do not use it to train models.
        </p>
      </Clause>

      <Clause n={3} title="Your models and keys">
        <p>
          Keys for hosted providers are encrypted at rest with AES-256-GCM and bound to the address they were saved for. They are decrypted only to check them, list the provider&rsquo;s
          models and run your own prompts on the provider you chose, and they are never written to logs. When you run a prompt on a hosted model, it goes from our server to that
          provider with your key, and the provider&rsquo;s own privacy policy applies to it.
        </p>
        <p>
          A model on your own computer or network (Ollama, LM Studio, or a custom address you mark as running in your browser) is called straight from your browser. Its prompts and
          replies never pass through our servers, and a key for it is kept only in that browser; we store the model&rsquo;s label and address so it shows up in your list. Browsers
          differ in what they can reach: Chrome and Edge reach models anywhere on your network after asking you once, Firefox reaches models on the same computer, and Safari needs
          the model served over https.
        </p>
      </Clause>

      <Clause n={4} title="Signing in">
        <p>
          You sign in with a link sent by email (delivered by Resend), or with Google or GitHub. A sign-in lasts 30 days, kept in a cookie that exists only to keep you signed in. We
          use no advertising cookies.
        </p>
      </Clause>

      <Clause n={5} title="Analytics and errors">
        <p>
          We count page views and product events with PostHog in cookieless mode, so it sets no cookies, and the text of your prompts is never sent to it. When something breaks, an
          error report goes to Sentry. Request bodies and anything shaped like an API key are removed before a report leaves our servers.
        </p>
      </Clause>

      <Clause n={6} title="Payments">
        <p>
          When Performance is on sale, payment goes through Stripe Checkout with Managed Payments. Stripe, through Link, is the merchant of record: it collects your payment
          details and handles tax, receipts and refunds. Your card number never reaches us.
        </p>
      </Clause>

      <Clause n={7} title="Who helps us run 41prompts">
        <ul>
          <li>Vercel hosts the site and the app.</li>
          <li>Neon hosts the database.</li>
          <li>Resend delivers sign-in emails.</li>
          <li>Google and GitHub, if you sign in with them.</li>
          <li>PostHog for analytics and Sentry for error reports.</li>
          <li>Stripe for payments.</li>
          <li>The model providers you add (for example OpenAI, Anthropic, Google or OpenRouter), only for the checks and runs you start with your own keys.</li>
        </ul>
      </Clause>

      <Clause n={8} title="Export and deletion">
        <p>
          You can export everything at any time from Settings, as Markdown and JSON in one .zip file. Deleting your account removes everything straight away: prompts, versions,
          saved models, keys and sign-ins. A prompt you delete on its own is removed for good by a daily cleanup once it has been deleted for 24 hours.
        </p>
      </Clause>

      <Clause n={9} title="Changes">
        <p>If this page changes, we will update the date at the bottom of it. If a change affects how your data is handled, we will also tell you by email.</p>
      </Clause>

      <Clause n={10} title="Contact">
        <ContactLine topic="your data" />
      </Clause>
    </LegalPage>
  );
}
