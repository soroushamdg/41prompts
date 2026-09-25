#!/usr/bin/env node
/**
 * Run a command with `STRIPE_SECRET_KEY` set from the Stripe CLI's own config, and never print it.
 *
 *   node scripts/with-stripe-env.mjs -- npx tsx scripts/stripe-products.mts
 *   node scripts/with-stripe-env.mjs --project 41prompts -- pnpm --filter @41prompts/web start
 *
 * ## Why this exists
 *
 * EPIC-070 needs the key in three places — the provisioning script, the parity test, and the built
 * app the drive clicks through — and `ADR-007 §8` says it is configuration that is never committed.
 * The only copy of it on this machine belongs to the Stripe CLI, which put it in
 * `~/.config/stripe/config.toml` when `stripe login` ran.
 *
 * The obvious thing is `export STRIPE_SECRET_KEY=$(grep …)`, and it is the wrong thing twice over:
 * it puts a live credential into a shell history and into whatever transcript the shell is being
 * read in, and it is retyped slightly differently by every person and every script that needs it.
 * This reads the same file, hands the value **only** to the child process's environment, and has no
 * code path that writes it anywhere else.
 *
 * ## What it guarantees
 *
 * 1. **The key is never printed.** Not on success, not on failure, not in the usage text. The only
 *    thing this reports about the value is its prefix class — `sk_test` or `rk_test` — which is a
 *    fact about the mode, not a fragment of the secret.
 * 2. **A live key is refused outright.** `scripts/stripe-products.mts` already refuses one at the
 *    point of creating objects; this refuses one before the child process starts, so nothing that
 *    goes through this launcher can touch a live account by accident. Putting live objects in place
 *    is a deliberate act with a person watching.
 * 3. **An existing `STRIPE_SECRET_KEY` in the environment wins.** A deployment, or a person who
 *    exported one on purpose, is not second-guessed — this only fills a gap.
 *
 * ## What it does not do
 *
 * It does not read, set or know about `STRIPE_WEBHOOK_SECRET`. That one is minted by `stripe
 * listen` for the lifetime of one forwarding session and printed by it on start; it is not in the
 * config file and there is nothing here to read. Pass it to the child yourself.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG = join(homedir(), ".config", "stripe", "config.toml");

function usage(why) {
  console.error(`${why}\n\nusage: node scripts/with-stripe-env.mjs [--project NAME] -- <command> [args...]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
if (separator === -1 || separator === argv.length - 1) usage("No command given.");

const flags = argv.slice(0, separator);
const command = argv.slice(separator + 1);

const projectFlag = flags.indexOf("--project");
const project = projectFlag === -1 ? "41prompts" : flags[projectFlag + 1];
if (typeof project !== "string" || project.length === 0) usage("--project needs a name.");

/**
 * The test-mode key for one project in the CLI's config.
 *
 * A hand-rolled section scan rather than a TOML dependency: the file has one shape, this reads one
 * key out of one section, and adding a parser to the repository to do it would be a dependency
 * whose only job is touching a credential.
 */
function testModeKeyFor(name) {
  let text;
  try {
    text = readFileSync(CONFIG, "utf8");
  } catch {
    usage(`No Stripe CLI config at ${CONFIG}. Run \`stripe login\` first.`);
  }

  const sections = text.split(/^\[/m);
  const section = sections.find((part) => part.startsWith(`${name}]`));
  if (section === undefined) usage(`The Stripe CLI has no project called "${name}". \`stripe config --list\` names the ones it has.`);

  const found = /^\s*test_mode_api_key\s*=\s*['"]([^'"]+)['"]/m.exec(section);
  if (found === null) usage(`Project "${name}" has no test_mode_api_key. Run \`stripe login --project-name ${name}\`.`);
  return found[1];
}

let key = process.env.STRIPE_SECRET_KEY;
let source = "the environment";
if (key === undefined || key.length === 0) {
  key = testModeKeyFor(project);
  source = `the Stripe CLI's "${project}" project`;
}

if (key.startsWith("sk_live") || key.startsWith("rk_live")) {
  console.error("That is a live key. This launcher is for test mode; refusing.");
  process.exit(2);
}

// The mode, not the value. `sk_test` is a class of key and says nothing about which key.
const mode = key.startsWith("rk_") ? "rk_test (restricted)" : "sk_test";
console.error(`STRIPE_SECRET_KEY set from ${source} — ${mode}. The value is not printed.`);

const child = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  env: { ...process.env, STRIPE_SECRET_KEY: key },
});

child.on("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(`could not start ${command[0]}: ${error.message}`);
  process.exit(1);
});
