import { Button, Input, LogoMark } from "@41prompts/ui";
import { sendMagicLinkAction, signInWithGitHubAction, signInWithGoogleAction } from "@/lib/auth-actions";

/**
 * Sign in and sign up, which are the same flow (EPIC-002 decision 2) wearing different words.
 *
 * EPIC-016 styles it and changes nothing about how it works: the three server actions, the `next`
 * round trip and the magic-link rate limit are all EPIC-002's and are untouched.
 *
 * **The side panel says what the product does today**, not what a plan includes. The mockup's version
 * lists "50 runs a month" and "All nine lessons" next to a pricing promise; none of that exists, and
 * decision 4 rules it out.
 */
export function SignInForm({
  heading,
  sub,
  alt,
  next,
  sent,
  error
}: {
  heading: string;
  sub: string;
  alt: { readonly question: string; readonly name: string; readonly href: string };
  next: string;
  sent: boolean;
  error?: string;
}) {
  return (
    <div className="auth-wrap">
      <main className="auth-form" id="main">
        <div>
          <LogoMark href="/" size="20px" />
          <h1>{heading}</h1>
          <p className="auth-form-sub">{sub}</p>

          {sent && (
            <p className="auth-notice" role="status">
              Check your email for a sign-in link. It expires in 15 minutes.
            </p>
          )}
          {error !== undefined && (
            <p className="auth-notice" role="alert">
              {error}
            </p>
          )}

          <div className="auth-providers">
            <form action={signInWithGoogleAction}>
              <input type="hidden" name="next" value={next} />
              <Button type="submit">Continue with Google</Button>
            </form>
            <form action={signInWithGitHubAction}>
              <input type="hidden" name="next" value={next} />
              <Button type="submit">Continue with GitHub</Button>
            </form>
          </div>

          <p className="auth-or">
            <span>or</span>
          </p>

          <form action={sendMagicLinkAction}>
            <input type="hidden" name="next" value={next} />
            <label className="auth-field-label" htmlFor="email">
              Email
            </label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
            <Button type="submit" variant="primary" className="auth-submit">
              Send sign-in link
            </Button>
          </form>

          <p className="auth-alt">
            {alt.question} <a href={alt.href}>{alt.name}</a>
          </p>
        </div>
      </main>

      <aside className="auth-side">
        <div>
          <p className="eyebrow">41Prompts</p>
          <h2>See what is actually in your prompt.</h2>
          <p>
            You do not need an account for that part. <a href="/decompile">The decompiler</a> is open
            to anyone, stores nothing, and is the whole of what works today.
          </p>
        </div>
      </aside>
    </div>
  );
}
