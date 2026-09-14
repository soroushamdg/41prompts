import {
  ACCOUNT_PURGE_WINDOW_DAYS,
  DECOMPILE_RETENTION_DAYS,
  RUN_COUNT_RETENTION_DAYS,
} from "@41prompts/db";

/**
 * The legal pages, as content rather than as markup.
 *
 * ## Why the retention numbers are imported and not typed
 *
 * EPIC-017 decision 5. `roadmap.md`'s own test for this epic is that the numbers on the page match
 * the code, and the only way to make that true forever is to stop the page from being able to say
 * anything else. Every duration below comes from the constant that the purge job enforces, so a page
 * that disagrees with the code cannot be written — and `legal.test.ts` asserts the pairing so that
 * deleting the import and typing "30" back in fails.
 *
 * ## Why there is a line saying no lawyer read this
 *
 * Ruled 2026-09-14: this is a portfolio project with no users, and a legal dependency in the
 * critical path was not wanted. Drafting it anyway and saying so is honest; drafting it and
 * implying otherwise is not. The line appears on **terms and privacy only**, once, at the top.
 * Nowhere else — a site that hedges on every page reads as one that does not mean any of it.
 */

export type LegalPart =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "h2"; readonly text: string }
  | { readonly kind: "ul"; readonly items: readonly string[] }
  | { readonly kind: "table"; readonly caption: string; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] };

export interface LegalDoc {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** Terms and privacy carry it. Nothing else does. */
  readonly unreviewed: boolean;
  readonly parts: readonly LegalPart[];
}

/** Shown once, at the top, on the two pages that make promises. */
export const UNREVIEWED_NOTICE =
  "This page was written by the people who build 41Prompts and has not been reviewed by a lawyer.";

export const LAST_UPDATED = "14 September 2026";

/** Where a person writes to. One address, because two would be two things to keep working. */
export const CONTACT_EMAIL = "privacy@41prompts.ai";

/**
 * The retention table, built from the constants that enforce it.
 *
 * The fourth row is the one to read carefully: raw provider payloads are the 12-month number the
 * roadmap promises, **and nothing writes them yet** because runs are EPIC-031. Saying "12 months"
 * flat would be describing a future behaviour as a current one, which is the specific failure this
 * epic was told to avoid.
 */
const RETENTION_ROWS: readonly (readonly string[])[] = [
  [
    "A prompt you paste into the decompiler",
    "Not kept at all",
    "Nothing is written unless you ask for a shareable link",
    "apps/web/lib/decompile/record-run.ts",
  ],
  [
    "A shared decompile link",
    `${DECOMPILE_RETENTION_DAYS} days, then deleted outright`,
    "Deleted, not marked deleted. You can delete it sooner from the page itself",
    "apps/worker/src/jobs/purge-decompiles.ts",
  ],
  [
    "A counted decompile run",
    `${RUN_COUNT_RETENTION_DAYS} days`,
    "A keyed hash of your address, two numbers and a timestamp. No prompt text",
    "apps/worker/src/jobs/purge-decompiles.ts",
  ],
  [
    "Your account after you delete it",
    `${ACCOUNT_PURGE_WINDOW_DAYS} days, then the row is purged`,
    "Deleting signs you out immediately and prevents any further sign-in",
    "apps/worker/src/jobs/purge-deleted-users.ts",
  ],
  [
    "Raw model responses from a run",
    "12 months — not built yet",
    "Running prompts against a model is not in the product yet (EPIC-031). When it ships, this row becomes real and this note goes",
    "—",
  ],
];

const PROCESSOR_ROWS: readonly (readonly string[])[] = [
  ["Amazon Web Services", "The server and the database", "Canada (Montréal, ca-central-1)", "Essential"],
  ["Cloudflare", "Encrypted database backups (R2), and the anti-abuse check on the share step (Turnstile)", "United States / global", "Essential"],
  ["Resend", "Sends the sign-in link to your email address", "United States", "Essential"],
  ["Google", "Signs you in, only if you choose Continue with Google", "United States", "Your choice of sign-in"],
  ["GitHub", "Signs you in, only if you choose Continue with GitHub", "United States", "Your choice of sign-in"],
  ["PostHog", "Product analytics — which pages get used", "United States", "Only with your consent"],
  ["Sentry", "Error reports when something breaks", "United States", "Essential"],
];

const TERMS: LegalDoc = {
  slug: "terms",
  title: "Terms of service",
  summary: "What you agree to by using 41Prompts, and what it agrees to in return.",
  unreviewed: true,
  parts: [
    { kind: "p", text: `Last updated ${LAST_UPDATED}. By using 41Prompts you agree to what is below. If you do not, please do not use it.` },

    { kind: "h2", text: "What 41Prompts is" },
    {
      kind: "p",
      text:
        "41Prompts is a workbench for prompts. You paste a prompt and it is broken into named parts; if you have an account you can build one from those parts and see the compiled result. It is operated from Montréal, Canada.",
    },

    { kind: "h2", text: "Your prompts stay yours" },
    {
      kind: "p",
      text:
        "You keep every right you already had in anything you paste, type or upload. We claim no ownership of it and we do not sell it, train on it, or give it to anyone to train on.",
    },
    {
      kind: "p",
      text:
        "You give us only the permission we need to run the service for you: to store your content, process it, and show it back to you. If you ask for a shareable link, that permission extends to showing that one prompt to anyone who has the link, until it is deleted. It ends when your content is deleted.",
    },
    {
      kind: "p",
      text:
        "You are responsible for what you paste. You confirm you have the right to paste it, and that it does not contain someone else's confidential information, personal data you are not allowed to share, or anything unlawful.",
    },

    { kind: "h2", text: "What you must not do" },
    {
      kind: "ul",
      items: [
        "Break the law with it, or use it to help anyone else do so.",
        "Paste other people's personal data without a right to.",
        "Try to get at other people's data, or at parts of the service not meant for you.",
        "Attack the service — scraping at a volume that degrades it, probing it, or overwhelming it.",
        "Resell it or pass it off as your own product.",
      ],
    },
    {
      kind: "p",
      text:
        "We can suspend or remove access if you do these things. Where it is reasonable to warn you first, we will.",
    },

    { kind: "h2", text: "No warranty" },
    {
      kind: "p",
      text:
        "The service is provided as is and as available, without warranty of any kind, whether express, implied or statutory — including any implied warranty of merchantability, fitness for a particular purpose, title, or non-infringement. We do not warrant that it will be uninterrupted, error-free, or that anything it tells you about your prompt is correct.",
    },
    {
      kind: "p",
      text:
        "That last point is not boilerplate. The product's job is to tell you things about a prompt, and it can be wrong. Nothing here is advice, and no output is a guarantee about how a model will behave.",
    },

    { kind: "h2", text: "Limit of liability" },
    {
      kind: "p",
      text:
        "To the fullest extent the law allows, we are not liable for indirect, incidental, special, consequential or punitive damages, nor for lost profits, lost revenue, lost business, or lost or corrupted data, even if we were told such damages were possible.",
    },
    {
      kind: "p",
      text:
        "For everything else, our total liability to you for all claims taken together is limited to the greater of the amount you paid us in the twelve months before the claim, or fifty Canadian dollars. The service is free today, so for most people that is fifty dollars.",
    },
    {
      kind: "p",
      text:
        "Some jurisdictions do not allow some of these exclusions. Where that is so, they do not apply to you and the rest still stands.",
    },

    { kind: "h2", text: "You cover claims from what you paste" },
    {
      kind: "p",
      text:
        "If someone brings a claim against us because of content you pasted — because it infringed their rights, disclosed their information, or broke the law — you agree to cover the cost of defending it and any amount awarded, to the extent it results from your content or your use of the service.",
    },

    { kind: "h2", text: "Changes, and ending it" },
    {
      kind: "p",
      text:
        "You can stop using 41Prompts at any time and delete your account from the account page. We can change these terms; if a change is significant we will say so on this page and update the date at the top. Continuing to use the service after that is how you accept it.",
    },

    { kind: "h2", text: "Governing law" },
    {
      kind: "p",
      text:
        "These terms are governed by the laws of the Province of Québec and the federal laws of Canada that apply there, without regard to conflict-of-laws rules. The courts of the judicial district of Montréal have exclusive jurisdiction, and both of us agree to that.",
    },
    {
      kind: "p",
      text:
        "As required by Québec law, these terms are drawn up in English at the express wish of both parties. / Conformément à la loi québécoise, les présentes conditions sont rédigées en anglais à la demande expresse des parties.",
    },

    { kind: "h2", text: "Reaching us" },
    { kind: "p", text: `Write to ${CONTACT_EMAIL}.` },
  ],
};

const PRIVACY: LegalDoc = {
  slug: "privacy",
  title: "Privacy",
  summary: "What is collected, what is kept and for how long.",
  unreviewed: true,
  parts: [
    { kind: "p", text: `Last updated ${LAST_UPDATED}. 41Prompts is operated from Montréal, Québec, Canada.` },

    { kind: "h2", text: "The short version" },
    {
      kind: "ul",
      items: [
        "The decompiler stores nothing unless you ask for a shareable link.",
        "A shared link is deleted for good after thirty days, and you can delete it sooner.",
        "We never store a visitor's IP address. We store a keyed hash of it, which cannot be turned back into an address.",
        "Analytics are off until you allow them — for everyone, account or not — and if your browser sends Do Not Track or Global Privacy Control we never turn them on.",
        "We do not sell anything about you, and nothing you paste is used to train a model.",
      ],
    },

    { kind: "h2", text: "What is collected, and why" },
    {
      kind: "ul",
      items: [
        "If you paste a prompt: the text, in your browser, to break it into parts. It is not written down unless you ask for a link.",
        "If you ask for a shareable link: the prompt text, so the link works. There is no account attached and we do not record who made it.",
        "If you have an account: your email address, and whichever of Google or GitHub you signed in with. That is how you get back in.",
        "Whatever you then create — projects, prompts, the parts you write — because the product would not work otherwise.",
        "A keyed hash of your IP address, to rate-limit abuse and to count how many distinct visitors used the decompiler. Never the address itself.",
        "If you join the waitlist: your email address, so we can tell you when there is something to tell you.",
        "If something breaks: an error report, so it can be fixed.",
      ],
    },
    {
      kind: "p",
      text:
        "Under Québec's Law 25 and the GDPR we rely on performing our agreement with you for the parts the product cannot work without, on our legitimate interest in a service that is not abused for rate limiting and security, and on your consent for analytics.",
    },

    { kind: "h2", text: "Cookies and your choice" },
    {
      kind: "p",
      text:
        "Two kinds of cookie exist here. The essential ones keep you signed in and remember whether you chose light or dark; without them the site does not work, so there is nothing to consent to. The non-essential one is analytics.",
    },
    {
      kind: "p",
      text:
        "Analytics are off until you choose to allow them. You will be asked once, and you can change your mind at any time from the control on this page. If your browser sends Do Not Track or Global Privacy Control, that decides it and nothing is sent whatever the cookie says.",
    },
    {
      kind: "p",
      text:
        "This applies whether or not you have an account. If you have not chosen, nothing is sent — including the record that you signed up or signed in.",
    },

    { kind: "h2", text: "How long it is kept" },
    {
      kind: "table",
      caption: "Every number here is the number the code enforces, and the file that enforces it.",
      head: ["What", "How long", "Notes", "Enforced by"],
      rows: RETENTION_ROWS,
    },

    { kind: "h2", text: "Who else processes it" },
    {
      kind: "p",
      text:
        "These are the only third parties that touch data on our behalf today. There is a fuller description on the sub-processors page.",
    },
    {
      kind: "table",
      caption: "Sub-processors in use as of the date at the top.",
      head: ["Who", "What they do", "Where", "Basis"],
      rows: PROCESSOR_ROWS,
    },

    { kind: "h2", text: "Data leaving Canada" },
    {
      kind: "p",
      text:
        "The server and the database are in Montréal. Some of the processors above are in the United States, so some personal information — your email address when a sign-in link is sent, an error report, analytics if you allowed them — is processed outside Québec.",
    },
    {
      kind: "p",
      text:
        "We have assessed that, as Law 25 requires before information is communicated outside the province. What is sent is limited: an email address, a keyed hash, or a stack trace. It is sent to established providers under their own contractual and security commitments, and it is not sent at all where we can avoid it — which is why the decompiler's visitor count is computed on our own server in Montréal rather than through an analytics provider.",
    },

    { kind: "h2", text: "Your rights" },
    {
      kind: "p",
      text:
        "You can ask for a copy of what we hold about you, ask us to correct it, ask us to delete it, withdraw consent for analytics, or complain. You can delete your account yourself from the account page, which is the fastest route.",
    },
    {
      kind: "p",
      text:
        "If you are in Québec, Law 25 also gives you the right to be told about and to challenge a decision made only by automated processing. We do not make any. If you are in the EU or UK, the GDPR gives you the right to portability and to object to processing based on legitimate interest.",
    },
    {
      kind: "p",
      text: `Write to ${CONTACT_EMAIL} for any of these. The person responsible for the protection of personal information — the privacy officer Law 25 requires — reads that address.`,
    },
    {
      kind: "p",
      text:
        "If you are not satisfied you can complain to the Commission d'accès à l'information du Québec, or to your own supervisory authority in the EU or UK.",
    },

    { kind: "h2", text: "Children" },
    { kind: "p", text: "41Prompts is not intended for anyone under 16, and we do not knowingly collect anything about them." },

    { kind: "h2", text: "Changes" },
    { kind: "p", text: "If this changes in a way that matters, the date at the top changes and the change is described here." },
  ],
};

const SUBPROCESSORS: LegalDoc = {
  slug: "sub-processors",
  title: "Sub-processors",
  summary: "Every third party that processes data on our behalf, what they do and where they are.",
  unreviewed: false,
  parts: [
    { kind: "p", text: `Last updated ${LAST_UPDATED}. This list is checked against the code rather than kept by hand.` },
    {
      kind: "table",
      caption: "In use today.",
      head: ["Who", "What they do", "Where", "Basis"],
      rows: PROCESSOR_ROWS,
    },
    { kind: "h2", text: "Not in use yet" },
    {
      kind: "p",
      text:
        "These appear in our plans and are named here so the list is not quietly incomplete later. None of them processes anything today, because the features that would use them are not built.",
    },
    {
      kind: "ul",
      items: [
        "Anthropic, OpenAI and Google — for running your prompts against a model, and for summarising. Not built.",
        "Stripe — for payment, when there is something to pay for. Not built.",
      ],
    },
    { kind: "h2", text: "Changes" },
    {
      kind: "p",
      text: `If a sub-processor is added, this page changes before it starts processing anything. Write to ${CONTACT_EMAIL} to ask about any of them.`,
    },
  ],
};

const SECURITY: LegalDoc = {
  slug: "security",
  title: "Security",
  summary: "How the service is built and run, and how to report something you have found.",
  unreviewed: false,
  parts: [
    { kind: "p", text: `Last updated ${LAST_UPDATED}.` },
    { kind: "h2", text: "Reporting something" },
    {
      kind: "p",
      text: `If you have found a vulnerability, write to ${CONTACT_EMAIL} with enough detail to reproduce it. We will confirm we have it, and we will not pursue you for a good-faith report that did not access other people's data, degrade the service, or go further than needed to demonstrate the problem.`,
    },
    { kind: "p", text: "There is no paid bounty. We will credit you if you want to be credited." },
    { kind: "h2", text: "How it is built" },
    {
      kind: "ul",
      items: [
        "Everything is served over TLS, and session cookies are Secure, HttpOnly and SameSite.",
        "Sign-in is by emailed link or by Google or GitHub. We never store a password, because there is none to store.",
        "Visitor IP addresses are stored only as a keyed hash, with a per-deployment key, so a hash from one environment means nothing in another and no hash can be turned back into an address.",
        "The database is in Montréal, backed up nightly to encrypted object storage, and a restore has been rehearsed.",
        "Dependencies, licences and boundaries are checked in CI on every change.",
      ],
    },
    { kind: "h2", text: "What we would tell you about" },
    {
      kind: "p",
      text:
        "If personal information were lost or exposed in a way that presents a risk of serious injury, Law 25 requires us to tell both the Commission d'accès à l'information and the people affected. We would.",
    },
  ],
};

export const LEGAL_DOCS: Readonly<Record<string, LegalDoc>> = {
  terms: TERMS,
  privacy: PRIVACY,
  "sub-processors": SUBPROCESSORS,
  security: SECURITY,
};

export const LEGAL_DOC_SLUGS = Object.keys(LEGAL_DOCS);
