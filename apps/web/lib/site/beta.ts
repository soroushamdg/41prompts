/**
 * The beta notice: which deployment shows it, and the one URL it points at.
 *
 * Read from `DEPLOY_ENV` per request rather than baked into the build, because staging and production
 * run the same image and only the environment tells them apart. Local development and the e2e suite
 * set neither value and get no notice, so no screenshot baseline moves because of it.
 */
export type BetaEnvironment = "production" | "staging";

export function betaEnvironment(deployEnv: string | undefined): BetaEnvironment | undefined {
  if (deployEnv === "production" || deployEnv === "staging") return deployEnv;
  return undefined;
}

/** Where the dialog sends somebody who would rather have the newest build. */
export const STAGING_URL = "https://staging.41prompts.ai";

/**
 * Set once the production dialog has been dismissed, so it is asked once per browser rather than on
 * every page. The strip stays either way; it is the dialog that would be a nuisance twice.
 */
export const BETA_SEEN_COOKIE_NAME = "41prompts_beta_seen";
