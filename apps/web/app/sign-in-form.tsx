import { sendMagicLinkAction, signInWithGitHubAction, signInWithGoogleAction } from "@/lib/auth-actions";

export function SignInForm({
  heading,
  next,
  sent,
  error,
}: {
  heading: string;
  next: string;
  sent: boolean;
  error?: string;
}) {
  return (
    <main>
      <h1>{heading}</h1>

      {sent && <p role="status">Check your email for a sign-in link. It expires in 15 minutes.</p>}
      {error && <p role="alert">{error}</p>}

      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={next} />
        <button type="submit">Continue with Google</button>
      </form>

      <form action={signInWithGitHubAction}>
        <input type="hidden" name="next" value={next} />
        <button type="submit">Continue with GitHub</button>
      </form>

      <form action={sendMagicLinkAction}>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <button type="submit">Send sign-in link</button>
      </form>
    </main>
  );
}
