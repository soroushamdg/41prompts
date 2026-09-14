// Is staging actually serving? Not "is a process up" — serving.
//
// `/healthz` was green through the whole of the 2026-09-13 outage. It returns a JSON literal
// from a route handler; it cannot know that the stylesheet 404s, and unstyled text is exactly
// what EPIC-021a and EPIC-021b shipped to staging while 151 Playwright assertions stayed green.
// So `/healthz` is checked first and trusted for nothing: it identifies the commit, and the
// checks that follow decide whether the deploy works.
//
// Four checks, each of which failed for real at least once on 2026-09-13:
//   1. /healthz answers, says ok, and names the commit and the environment.
//   2. The apex renders HTML with a stylesheet link in it.
//   3. That stylesheet is fetched and is real CSS of a plausible size — the 2026-09-13
//      failure mode was a <link> pointing at a chunk that was not there.
//   4. /sign-in renders a submittable form, because that is where every browser drive starts
//      and a drive that cannot sign in cannot pass.
//
// Exit 0 when staging is serving, 1 when it is not. --json prints the detail.

// Overridable so the runner's own tests can point the check at a host that is deliberately
// not there, and so a future preview environment does not need a second copy of this file.
const ENVS = {
  staging: {
    apex: process.env.STAGING_APEX_URL ?? "https://staging.41prompts.ai",
    app: process.env.STAGING_APP_URL ?? "https://app.staging.41prompts.ai"
  },
  production: {
    apex: process.env.PRODUCTION_APEX_URL ?? "https://41prompts.ai",
    app: process.env.PRODUCTION_APP_URL ?? "https://app.41prompts.ai"
  }
};

const envName = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : "staging";
const target = ENVS[envName];
if (!target) {
  process.stderr.write(`unknown environment: ${envName}\n`);
  process.exit(2);
}

const TIMEOUT_MS = Number(process.env.STAGING_CHECK_TIMEOUT_MS ?? 20000);
// A built Tailwind stylesheet for this app is ~50 KB. Anything under a few hundred bytes is
// an error page with a CSS content-type, not a stylesheet.
const MIN_CSS_BYTES = 500;

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const body = await res.text();
    return { ok: true, status: res.status, contentType: res.headers.get("content-type") ?? "", body, url: res.url };
  } catch (err) {
    return { ok: false, status: 0, contentType: "", body: "", url, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

const checks = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  return pass;
};

let commit = null;

// 1 — liveness, and the commit it identifies.
const health = await get(`${target.app}/healthz`);
if (health.status !== 200) {
  record("healthz answers", false, health.error ?? `HTTP ${health.status}`);
} else {
  let parsed = null;
  try {
    parsed = JSON.parse(health.body);
  } catch {
    /* handled below */
  }
  if (!parsed?.ok) {
    record("healthz answers", false, `body was not {ok:true}: ${health.body.slice(0, 120)}`);
  } else {
    commit = parsed.commit ?? null;
    record("healthz answers", true, `ok, env=${parsed.env}, commit=${String(commit).slice(0, 12)}`);
    if (envName === "staging" && parsed.env !== "staging") {
      record("healthz names the right environment", false, `env=${parsed.env}`);
    }
  }
}

// 2 — the apex renders HTML, and that HTML asks for a stylesheet.
const apex = await get(`${target.apex}/`);
let cssHref = null;
if (apex.status !== 200) {
  record("apex renders", false, apex.error ?? `HTTP ${apex.status}`);
} else if (!/<html/i.test(apex.body)) {
  record("apex renders", false, `HTTP 200 but no <html> in ${apex.body.length} bytes`);
} else {
  cssHref = apex.body.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/i)?.[1]
    ?? apex.body.match(/<link[^>]+href="([^"]+\.css[^"]*)"/i)?.[1]
    ?? null;
  record("apex renders", true, `HTTP 200, ${apex.body.length} bytes`);
  record(
    "apex links a stylesheet",
    cssHref !== null,
    cssHref ?? "no <link rel=stylesheet> in the document — this is the unstyled-text failure"
  );
}

// 3 — the stylesheet the page asked for is actually there. This is the check /healthz
//     cannot make and the one that would have caught 2026-09-13.
if (cssHref) {
  const cssUrl = cssHref.startsWith("http") ? cssHref : `${target.apex}${cssHref}`;
  const css = await get(cssUrl);
  const isCss = css.contentType.includes("text/css");
  const bigEnough = css.body.length >= MIN_CSS_BYTES;
  record(
    "the stylesheet is served",
    css.status === 200 && isCss && bigEnough,
    css.status !== 200
      ? (css.error ?? `HTTP ${css.status} for ${cssHref}`)
      : !isCss
        ? `content-type ${css.contentType}`
        : !bigEnough
          ? `only ${css.body.length} bytes`
          : `HTTP 200, ${css.body.length} bytes of ${css.contentType.split(";")[0]}`
  );
}

// 4 — the drive's front door.
const signIn = await get(`${target.app}/sign-in`);
if (signIn.status !== 200) {
  record("sign-in renders", false, signIn.error ?? `HTTP ${signIn.status}`);
} else {
  const hasForm = /<form[\s>]/i.test(signIn.body) && /<button[^>]*type="submit"/i.test(signIn.body);
  record("sign-in renders", hasForm, hasForm ? "form with a submit button" : "HTTP 200 but no submittable form");
}

const pass = checks.every((c) => c.pass);
const result = { environment: envName, serving: pass, commit, checks };

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  for (const c of checks) {
    process.stdout.write(`${c.pass ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}\n`);
  }
  process.stdout.write(pass ? `${envName} is serving (commit ${String(commit).slice(0, 12)})\n` : `${envName} is NOT serving\n`);
}

process.exit(pass ? 0 : 1);
