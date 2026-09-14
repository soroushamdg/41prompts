// Did the run stop because the usage window ran out, and how long until it reopens?
//
// Read from the structured result, not from prose. Claude Code's `--output-format json`
// result object carries `api_error_status`, which is the HTTP status the API actually
// returned, and `terminal_reason`, which is why the turn ended. A 429 is the usage window
// saying no; it is a field, not a sentence, and it does not change wording between releases.
//
// Matching on the human-readable message is the fallback and is marked as such in the
// classification, so a log line says which signal fired. It exists because stderr is the only
// thing there is when the process dies before it can emit a result object at all.
//
//   node scripts/rate-limit.mjs classify <result.json> [stderr.txt]      -> no | api-429 | terminal-reason | text-fallback
//   node scripts/rate-limit.mjs wait-seconds <result.json> [stderr.txt]  -> integer seconds
//
// `wait-seconds` prefers a reset epoch when one is anywhere in the payload. When there is
// none it returns a poll interval, and the runner's next invocation is the probe: a 429 is
// refused before any model call, so asking again costs nothing but the round trip.

import { readFileSync, existsSync } from "node:fs";

const [, , command, resultPath, stderrPath] = process.argv;

const POLL_S = Number(process.env.AUTONOMOUS_RATE_LIMIT_POLL_S ?? 900);
// The window can reopen a few seconds after the stated reset; asking early wastes an attempt
// and re-arms the wait, so always sit just past it.
const GRACE_S = 60;

const read = (p) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");

const raw = read(resultPath);
const err = read(stderrPath);

// --verbose can put other JSON lines ahead of the result. The result object is the one with
// type "result"; take the last such line.
function resultObject(text) {
  let found = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.type === "result" || parsed?.subtype !== undefined) found = parsed;
    } catch {
      /* not a whole JSON line; skip */
    }
  }
  return found;
}

const result = resultObject(raw);

// Prose, and only used when nothing structured is available. Kept narrow on purpose: these
// are usage-window phrases, not any 429 and not "overloaded", which is a different failure
// that should retry quickly rather than sleep for hours.
const TEXT_SIGNALS = [
  /usage limit reached/i,
  /rate limit(?:ed)? (?:exceeded|reached)/i,
  /\b5-hour limit\b/i,
  /upgrade to increase your usage limit/i
];

function classify() {
  if (result) {
    if (Number(result.api_error_status) === 429) return "api-429";
    // A turn that ended on an API error with no status is ambiguous; only call it a rate
    // limit if the text agrees, otherwise it is an ordinary failure the runner should retry.
    if (result.terminal_reason === "api_error") {
      const text = `${result.result ?? ""} ${JSON.stringify(result.errors ?? [])}`;
      if (TEXT_SIGNALS.some((re) => re.test(text))) return "terminal-reason";
    }
    // A clean result object that is not a 429 is not a rate limit, whatever stderr says.
    if (result.is_error !== true) return "no";
  }
  if (TEXT_SIGNALS.some((re) => re.test(err) || re.test(raw))) return "text-fallback";
  return "no";
}

// Any of these, anywhere in the payload, is the moment the window reopens.
function resetEpoch() {
  const haystack = `${raw}\n${err}`;
  const patterns = [
    /"resets_at"\s*:\s*(\d{9,13})/,
    /"resetsAt"\s*:\s*(\d{9,13})/,
    /anthropic-ratelimit-unified-reset["\s:]+(\d{9,13})/i,
    /retry[-_ ]after["\s:]+(\d{1,7})\b/i
  ];
  for (const [index, re] of patterns.entries()) {
    const m = haystack.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    // retry-after is a duration, the rest are epochs; milliseconds are epochs too.
    if (index === 3) return Math.floor(Date.now() / 1000) + n;
    return n > 1e11 ? Math.floor(n / 1000) : n;
  }
  return null;
}

if (command === "classify") {
  process.stdout.write(classify() + "\n");
} else if (command === "wait-seconds") {
  const epoch = resetEpoch();
  if (epoch) {
    const seconds = epoch - Math.floor(Date.now() / 1000) + GRACE_S;
    process.stdout.write(String(Math.max(GRACE_S, seconds)) + "\n");
  } else {
    process.stdout.write(String(POLL_S) + "\n");
  }
} else {
  process.stderr.write("usage: rate-limit.mjs classify|wait-seconds <result.json> [stderr.txt]\n");
  process.exit(2);
}
