/**
 * The pages that will exist and do not yet.
 *
 * Decision 6: a footer link to a page that is not written must reach *a plain "coming before launch"
 * stub rather than a 404*. The stub says which page it is and what will be on it, because a
 * placeholder that could be any page reads as an abandoned site rather than an unfinished one.
 *
 * EPIC-017 replaces these with the real text; that epic does not exist yet, and nothing here waits
 * on it.
 */

export interface Stub {
  readonly title: string;
  readonly summary: string;
}

export const LEGAL_STUBS: Readonly<Record<string, Stub>> = {
  terms: {
    title: "Terms of service",
    summary: "What you agree to by using 41Prompts, and what it agrees to in return."
  },
  privacy: {
    title: "Privacy",
    summary:
      "What is collected, what is kept and for how long. Until this is written, the short version holds and is enforced in code: the decompiler stores nothing unless you ask for a shareable link, a shared link is deleted after thirty days, and the only thing kept about a visitor is a keyed hash of their address, never the address itself."
  },
  security: {
    title: "Security",
    summary: "How the service is built and run, and how to report something you have found."
  },
  "sub-processors": {
    title: "Sub-processors",
    summary: "Every third party that processes data on our behalf, what they do and where they are."
  }
};

export const LEGAL_SLUGS = Object.keys(LEGAL_STUBS);
