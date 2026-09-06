#!/usr/bin/env node
// EPIC-004 acceptance criterion: "A PostHog dashboard containing every milestone metric from
// docs/roadmap.md, showing zero where there is no data yet." One-shot, idempotent (looks up an
// existing dashboard/insight by name before creating a duplicate) — see infra/README.md's
// "PostHog dashboard" section for how and when to run this.
//
// Run for real against the live 41prompts PostHog project (EU region) during EPIC-004's
// closeout, after an earlier version of this script (written before a real account existed to
// test against) turned out to be wrong in two ways once it hit a real API: no default region
// (see HOST below) and the legacy `filters` insight shape PostHog has since deprecated (see
// getOrCreateInsight below). Both fixed and re-verified against the real dashboard.
//
// Four of the eight milestones below (M0, M5a, M6, M7) aren't PostHog-trackable at all — M0 is a
// CI deploy count, M5a comes from CDN access logs, M6 from Stripe, M7 has no event in the closed
// nine-name set (docs/roadmap.md's Stage 7 postdates this epic). Rather than fabricate a
// misleading "real" trend for those, each is still created as an insight (so the dashboard truly
// has all eight, per the criterion) but on the closest available proxy event, named to say
// plainly it's a placeholder — never presented as the actual leading metric.
import { env, exit } from "node:process";

const PERSONAL_API_KEY = env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = env.POSTHOG_PROJECT_ID;
// No default: this repo's own project is EU (NEXT_PUBLIC_POSTHOG_HOST is
// https://eu.i.posthog.com in Coolify), but .env.example's own documented default is US --
// guessing wrong here fails hard with an unhelpful 401, not a clear error, so it's a required
// value instead of a silently-wrong default (found the hard way: an earlier version of this
// script assumed the US host and every request against the real EU-region account failed).
const HOST = env.POSTHOG_HOST;
const DASHBOARD_NAME = "41Prompts milestones";

if (!PERSONAL_API_KEY || !PROJECT_ID || !HOST) {
  console.error(
    "Usage: POSTHOG_PERSONAL_API_KEY=... POSTHOG_PROJECT_ID=... POSTHOG_HOST=https://eu.posthog.com|https://us.posthog.com node scripts/create-posthog-dashboard.mjs",
  );
  exit(1);
}

// [milestone name, insight name, the event it trends, whether that event is the real leading
// metric or just a stand-in for something PostHog doesn't track].
const MILESTONES = [
  ["M0 Green build", "M0: five consecutive green deploys (tracked via CI, not PostHog — placeholder)", "signup", false],
  ["M1 Decompiler soft-public", "M1: unique decompiles in 30 days", "decompile_view", true],
  ["M2 Editor", "M2: signed-in users who create ≥1 prompt", "project_created", true],
  ["M3 First run", "M3: users who complete a run", "run_passed", true],
  ["M4 Three models", "M4: runs using more than one provider", "run_started", true],
  ["M5a SDK live", "M5a: production apps resolving from the CDN (tracked via access logs, not PostHog — placeholder)", "publish", false],
  ["M6 Revenue", "M6: paying customers / MRR (tracked via Stripe, not PostHog — placeholder)", "publish", false],
  ["M7 Lessons", "M7: Lesson 02 completion (no event defined yet — placeholder)", "login", false]
];

async function posthog(path, options = {}) {
  const response = await fetch(`${HOST}/api/projects/${PROJECT_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  if (!response.ok) {
    throw new Error(`PostHog API ${options.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function findByName(path, name) {
  const { results } = await posthog(`${path}?search=${encodeURIComponent(name)}`);
  return results.find((item) => item.name === name);
}

async function getOrCreateDashboard() {
  const existing = await findByName("/dashboards/", DASHBOARD_NAME);
  if (existing) {
    console.log(`Dashboard "${DASHBOARD_NAME}" already exists (id ${existing.id}), reusing it.`);
    return existing;
  }
  const created = await posthog("/dashboards/", {
    method: "POST",
    body: JSON.stringify({
      name: DASHBOARD_NAME,
      description: "Every milestone metric from docs/roadmap.md. Zero is expected until the product produces the events it counts."
    })
  });
  console.log(`Created dashboard "${DASHBOARD_NAME}" (id ${created.id}).`);
  return created;
}

async function getOrCreateInsight(dashboardId, insightName, eventName) {
  const existing = await findByName("/insights/", insightName);
  if (existing) {
    console.log(`  insight "${insightName}" already exists (id ${existing.id}), reusing it.`);
    return existing;
  }
  // The legacy `filters` shape (insight/events/display) is rejected outright by current PostHog
  // instances ("Creating or updating insights with legacy filters is not available... Send a
  // query object instead") -- found by actually running this against a real account. This is
  // the modern query-node shape instead, confirmed against PostHog's own schema source
  // (frontend/src/queries/schema/schema-general.ts's TrendsQuery/InsightVizNode/EventsNode,
  // frontend/src/types.ts's BaseMathType.UniqueUsers = "dau").
  const created = await posthog("/insights/", {
    method: "POST",
    body: JSON.stringify({
      name: insightName,
      dashboards: [dashboardId],
      query: {
        kind: "InsightVizNode",
        source: {
          kind: "TrendsQuery",
          series: [{ kind: "EventsNode", event: eventName, math: "dau" }],
          trendsFilter: { display: "BoldNumber" }
        }
      }
    })
  });
  console.log(`  created insight "${insightName}" (id ${created.id}).`);
  return created;
}

const dashboard = await getOrCreateDashboard();
for (const [milestone, insightName, eventName, isRealMetric] of MILESTONES) {
  console.log(`${milestone}${isRealMetric ? "" : " (placeholder, not a real PostHog metric)"}`);
  await getOrCreateInsight(dashboard.id, insightName, eventName);
}

console.log(`\nDone. Open ${HOST}/project/${PROJECT_ID}/dashboard/${dashboard.id} to confirm it looks right.`);
