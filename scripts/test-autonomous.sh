#!/usr/bin/env bash
#
# Proves the unattended runner's stopping conditions by making each one happen.
#
# Every scenario runs the real scripts/run-next-epic.sh and scripts/run-epics.sh against a
# throwaway fixture repository, with a stub standing in for `claude`. The stub is the only
# thing faked: the pick, the resume, the STOP handling, the blocker counting, the release
# cadence and the staging preflight are all the shipping code.
#
#   scripts/test-autonomous.sh              all scenarios
#   scripts/test-autonomous.sh resume       one scenario
#
# The stub reads STUB_BEHAVIOUR from a file in the fixture so a scenario can change its mind
# between invocations:
#   steps:N    advance the run state N steps, exit 0
#   complete   advance to the end, clear the state, exit 0
#   blocker    write docs/epics/BLOCKER-<epic>.md, exit 0
#   ratelimit  emit a 429 result object, exit 1 (once, then switch to complete)
#   hang       sleep until killed

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ONLY="${1:-}"
PASS=0
FAIL=0

say()  { printf '%s\n' "$*"; }
head2() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
ok()   { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }

check() {
  local what="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then ok "$what ($actual)"; else bad "$what — expected '$expected', got '$actual'"; fi
}
contains() {
  local what="$1" needle="$2" file="$3"
  if grep -qF -- "$needle" "$file"; then ok "$what"; else bad "$what — '$needle' not in $file"; fi
}
absent() {
  local what="$1" needle="$2" file="$3"
  if grep -qF -- "$needle" "$file"; then bad "$what — '$needle' unexpectedly in $file"; else ok "$what"; fi
}

# --- the fixture -------------------------------------------------------------------------

make_fixture() {
  local dir; dir="$(mktemp -d)"
  mkdir -p "$dir/scripts" "$dir/docs/epics/sessions" "$dir/docs/epics/reports"
  cp "$REPO/scripts/pick-next-epic.mjs" "$REPO/scripts/check-staging.mjs" \
     "$REPO/scripts/run-state.mjs" "$REPO/scripts/rate-limit.mjs" \
     "$REPO/scripts/release-due.mjs" "$REPO/scripts/run-next-epic.sh" \
     "$REPO/scripts/run-epics.sh" "$REPO/scripts/gate-run.mjs" "$dir/scripts/"
  chmod +x "$dir/scripts/"*.sh

  cat > "$dir/scripts/stub-claude" <<'STUB'
#!/usr/bin/env bash
# Stands in for `claude -p`. Reads the prompt on stdin and ignores it; the runner only cares
# what the state file says afterwards.
cat >/dev/null
DIR="$(cd "$(dirname "$0")/.." && pwd)"
BEHAVIOUR="$(cat "$DIR/.stub-behaviour" 2>/dev/null || echo complete)"
EPIC="$(node "$DIR/scripts/run-state.mjs" get --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).epic)}catch{}})')"
cd "$DIR" || exit 1

emit_ok() {
  printf '{"type":"result","subtype":"success","is_error":false,"api_error_status":null,"terminal_reason":"completed","num_turns":4,"total_cost_usd":0.5,"result":%s}\n' "$1"
}

case "$BEHAVIOUR" in
  steps:*)
    N="${BEHAVIOUR#steps:}"
    i=0
    for step in $(node scripts/run-state.mjs steps); do
      i=$((i + 1)); [ "$i" -gt "$N" ] && break
      node scripts/run-state.mjs set --step "$step" >/dev/null
    done
    emit_ok "\"stopped after $N steps (stub)\""
    ;;
  complete)
    for step in $(node scripts/run-state.mjs steps); do
      node scripts/run-state.mjs set --step "$step" >/dev/null
    done
    # Step 12: tick this epic's own status cell. The one backlog edit an unattended run makes.
    sed -i.bak "s/^| $EPIC \(.*\)| todo |/| $EPIC \1| done |/" docs/backlog.md && rm -f docs/backlog.md.bak
    node scripts/run-state.mjs clear >/dev/null
    emit_ok "\"$EPIC complete (stub)\""
    ;;
  blocker)
    printf '# BLOCKER %s\n\nThe stub was told to block.\n' "$EPIC" > "docs/epics/BLOCKER-$EPIC.md"
    emit_ok "\"wrote a blocker (stub)\""
    ;;
  ratelimit)
    echo complete > "$DIR/.stub-behaviour"
    printf '{"type":"result","subtype":"error_during_execution","is_error":true,"api_error_status":429,"terminal_reason":"api_error","result":"Claude usage limit reached"}\n'
    exit 1
    ;;
  hang)
    # Report a couple of steps first so there is something real to resume from.
    node scripts/run-state.mjs set --step epic-file >/dev/null
    node scripts/run-state.mjs set --step plan >/dev/null
    while :; do sleep 1; done
    ;;
esac
STUB
  chmod +x "$dir/scripts/stub-claude"
  echo complete > "$dir/.stub-behaviour"
  printf '%s\n' "$dir"
}

backlog() {
  local dir="$1"; shift
  {
    printf '# Backlog\n\n## Stage 3 · Checks and runs, one provider\n\n'
    printf '| ID | Epic | Size | Depends | Status |\n|---|---|---|---|---|\n'
    for row in "$@"; do printf '%s\n' "$row"; done
  } > "$dir/docs/backlog.md"
}

# A pickable row needs an epic file: the picker stops on a `todo` row that has none. Kept out
# of backlog() on purpose, so a scenario can leave a row deliberately unwritten.
epic_files() {
  local dir="$1"; shift
  local id
  for id in "$@"; do
    printf '# %s\n\nA fixture epic file. Its only job is to exist.\n' "$id" \
      > "$dir/docs/epics/$id-fixture.md"
  done
}

roadmap() {
  cat > "$1/docs/roadmap.md" <<'RM'
# Roadmap

### ▣ GATE 3 · Stage 3 exit and loud-launch decision
Measured: 100 test runs with zero cache misses on repeats, cost within 5% of expected.
Go: proceed to EPIC-035 and Stage 4. No-go: fix-up epic (M), then re-gate.
RM
}

# Every scenario except the live-staging one points the preflight at a closed port or a
# stub server, so the tests never depend on staging being up.
live_staging_env() {
  printf 'STAGING_CHECK_TIMEOUT_MS=8000'
}
fake_staging_ok() {
  # A tiny server that answers all four preflight checks, so scenarios about stopping
  # conditions are not also testing the network.
  local dir="$1"
  node -e '
    const http = require("http");
    const css = "body{color:red}".padEnd(2000, " ");
    http.createServer((req, res) => {
      if (req.url === "/healthz") { res.writeHead(200, {"content-type":"application/json"}); return res.end(JSON.stringify({ok:true,commit:"stubcommit0000",env:"staging"})); }
      if (req.url.endsWith(".css")) { res.writeHead(200, {"content-type":"text/css"}); return res.end(css); }
      if (req.url === "/sign-in") { res.writeHead(200, {"content-type":"text/html"}); return res.end("<html><body><form><button type=\"submit\">Send</button></form></body></html>"); }
      res.writeHead(200, {"content-type":"text/html"});
      res.end("<html><head><link rel=\"stylesheet\" href=\"/s.css\"/></head><body>hi</body></html>");
    }).listen(0, "127.0.0.1", function () { console.log(this.address().port); });
  ' > "$dir/.stub-port" 2>/dev/null &
  echo $! > "$dir/.stub-server.pid"
  for _ in $(seq 1 40); do [ -s "$dir/.stub-port" ] && break; sleep 0.1; done
  cat "$dir/.stub-port"
}
stop_fake_staging() {
  local dir="$1"
  [ -f "$dir/.stub-server.pid" ] && kill "$(cat "$dir/.stub-server.pid")" 2>/dev/null
}

# Backoffs are turned down rather than off, so the code path still runs and the suite does
# not spend thirty seconds proving it can wait.
run_next() {
  local dir="$1"; shift
  ( cd "$dir" && env AUTONOMOUS_RETRY_BACKOFF_S=1 "$@" CLAUDE_BIN="$dir/scripts/stub-claude" ./scripts/run-next-epic.sh ) >"$dir/out.txt" 2>&1
}
run_loop() {
  local dir="$1"; shift
  ( cd "$dir" && env AUTONOMOUS_RETRY_BACKOFF_S=1 "$@" CLAUDE_BIN="$dir/scripts/stub-claude" ./scripts/run-epics.sh ) >"$dir/out.txt" 2>&1
}
outcome_of() {
  node -e 'try{process.stdout.write(require(process.argv[1]).outcome)}catch{process.stdout.write("none")}' "$1/docs/epics/.run-outcome.json" 2>/dev/null
}

want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

# =========================================================================================

if want gate; then
head2 "gate — the next row is ▣ GATE 3, so the loop stops instead of reaching past it"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" \
    '| EPIC-030 | core: check model | M | 020 | done |' \
    '| ▣ GATE 3 | Stage 3 exit + loud launch decision: criteria in roadmap | — | 034 | — |' \
    '| EPIC-035 | Loud launch | S | GATE 3 | todo |'
  PORT="$(fake_staging_ok "$D")"
  run_loop "$D" "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT"
  RC=$?
  stop_fake_staging "$D"
  check "run-epics.sh exit code" 0 "$RC"
  check "outcome" "gate-stop" "$(outcome_of "$D")"
  contains "the gate is named" "GATE REACHED: ▣ GATE 3" "$D/out.txt"
  contains "what it requires is written to the log" "100 test runs with zero cache misses" "$D/out.txt"
  contains "the loop stopped at it" "stopped at a gate" "$D/out.txt"
  absent  "EPIC-035 behind the gate was never picked" "PICKED EPIC-035" "$D/out.txt"
  rm -rf "$D"
fi

if want staging-down; then
head2 "staging-down — staging is not serving, so no epic starts"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |'
  epic_files "$D" EPIC-031
  run_loop "$D" "STAGING_APEX_URL=http://127.0.0.1:9" "STAGING_APP_URL=http://127.0.0.1:9" "STAGING_CHECK_TIMEOUT_MS=2000"
  RC=$?
  check "run-epics.sh propagates the failure" 3 "$RC"
  check "outcome" "staging-down" "$(outcome_of "$D")"
  contains "the refusal says why" "refusing to start EPIC-031" "$D/out.txt"
  contains "and names the drive as the reason" "browser drive could not pass" "$D/out.txt"
  absent  "no run was invoked" "invoking Claude Code" "$D/out.txt"
  rm -rf "$D"
fi

if want stop-between; then
head2 "stop-between — the STOP file is there before the first epic"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |'
  touch "$D/STOP"
  run_loop "$D"
  RC=$?
  check "run-epics.sh exit code" 0 "$RC"
  contains "the loop stopped between epics" "STOP file present" "$D/out.txt"
  absent "no epic was picked" "PICKED" "$D/out.txt"
  rm -rf "$D"
fi

if want stop-mid-epic; then
head2 "stop-mid-epic — STOP appears while an epic is running"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |'
  epic_files "$D" EPIC-031
  echo hang > "$D/.stub-behaviour"
  PORT="$(fake_staging_ok "$D")"
  ( cd "$D" && env "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT" \
      AUTONOMOUS_STOP_POLL_S=1 CLAUDE_BIN="$D/scripts/stub-claude" ./scripts/run-next-epic.sh ) >"$D/out.txt" 2>&1 &
  RUNNER=$!
  # Wait until the stub is actually working, then stop it.
  for _ in $(seq 1 100); do grep -q "invoking Claude Code" "$D/out.txt" 2>/dev/null && break; sleep 0.2; done
  sleep 2
  touch "$D/STOP"
  wait $RUNNER; RC=$?
  stop_fake_staging "$D"
  check "run-next-epic.sh exit code" 0 "$RC"
  check "outcome" "stopped" "$(outcome_of "$D")"
  contains "it stopped mid-epic" "STOP file appeared mid-epic" "$D/out.txt"
  contains "and terminated the run" "terminating the run" "$D/out.txt"
  if [ -f "$D/docs/epics/.run-state.json" ]; then
    ok "the state file survives, so the epic can resume"
  else
    bad "the state file was deleted — the epic would restart from scratch"
  fi
  check "it kept the progress the run had made" "plan" \
    "$(node -e 'process.stdout.write(require(process.argv[1]).lastStep??"")' "$D/docs/epics/.run-state.json")"
  rm -rf "$D"
fi

if want resume; then
head2 "resume — a run dies after step 4; the next invocation continues at step 5"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |'
  epic_files "$D" EPIC-031
  PORT="$(fake_staging_ok "$D")"
  ENVP=("STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT" "AUTONOMOUS_MAX_ATTEMPTS=1")

  echo "steps:4" > "$D/.stub-behaviour"
  run_next "$D" "${ENVP[@]}"
  check "first invocation leaves the epic unfinished" "incomplete" "$(outcome_of "$D")"
  check "last completed step recorded" "gates" \
    "$(node -e 'process.stdout.write(require(process.argv[1]).lastStep??"")' "$D/docs/epics/.run-state.json")"
  cp "$D/out.txt" "$D/first.txt"

  echo complete > "$D/.stub-behaviour"
  run_next "$D" "${ENVP[@]}"
  check "second invocation finishes it" "epic-done" "$(outcome_of "$D")"
  contains "it resumed rather than restarting" "RESUME EPIC-031" "$D/out.txt"
  contains "and said where from" "resuming at 'local-drive'" "$D/out.txt"
  absent  "it did not re-pick the epic from the backlog" "PICKED EPIC-031" "$D/out.txt"
  if [ -f "$D/docs/epics/.run-state.json" ]; then
    bad "the state file outlived the completed epic"
  else
    ok "the state file is deleted when the epic completes"
  fi
  stop_fake_staging "$D"
  rm -rf "$D"
fi

if want two-blockers; then
head2 "two-blockers — one blocker keeps going, two in a row stop the loop"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" \
    '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |' \
    '| EPIC-032 | web: input sets | M | 031 | todo |' \
    '| EPIC-033 | LLM-judge grader | S | 031 | todo |'
  epic_files "$D" EPIC-031 EPIC-032 EPIC-033
  echo blocker > "$D/.stub-behaviour"
  PORT="$(fake_staging_ok "$D")"
  run_loop "$D" "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT"
  RC=$?
  stop_fake_staging "$D"
  check "run-epics.sh exit code" 0 "$RC"
  contains "the first blocker did not stop the loop" "ended in a BLOCKER (1 consecutive)" "$D/out.txt"
  contains "the blockered epic was not handed back" "skipped EPIC-031 (todo) — an open blocker" "$D/out.txt"
  contains "the loop moved on to the next epic" "PICKED EPIC-032" "$D/out.txt"
  contains "the second did" "ended in a BLOCKER (2 consecutive)" "$D/out.txt"
  contains "and said why" "two epics in a row ended in a BLOCKER" "$D/out.txt"
  absent  "the third epic was never started" "PICKED EPIC-033" "$D/out.txt"
  if [ -f "$D/docs/epics/BLOCKER-EPIC-031.md" ] && [ -f "$D/docs/epics/BLOCKER-EPIC-032.md" ]; then
    ok "both blockers were written"
  else
    bad "a blocker file is missing"
  fi
  rm -rf "$D"
fi

if want release-cadence; then
head2 "release-cadence — three completed epics, then stop and write RELEASE-DUE.md"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" \
    '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |' \
    '| EPIC-032 | web: input sets | M | 031 | todo |' \
    '| EPIC-033 | LLM-judge grader | S | 031 | todo |' \
    '| EPIC-034 | Activation onboarding | S | 032 | todo |'
  epic_files "$D" EPIC-031 EPIC-032 EPIC-033 EPIC-034
  # A real repository, because release-due.mjs reads git history.
  ( cd "$D" && git init -q && git config user.email t@example.com && git config user.name t \
      && git add -A >/dev/null && git commit -qm one && git branch -M main \
      && git tag v0.1.0 \
      && git commit -q --allow-empty -m two && git commit -q --allow-empty -m three ) >/dev/null 2>&1
  PORT="$(fake_staging_ok "$D")"
  run_loop "$D" "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT" \
    "PRODUCTION_HEALTHZ=http://127.0.0.1:$PORT/healthz"
  RC=$?
  stop_fake_staging "$D"
  check "run-epics.sh exit code" 0 "$RC"
  contains "it counted to three" "3 of 3 since the last release" "$D/out.txt"
  contains "and stopped" "epics completed — writing" "$D/out.txt"
  contains "saying it never tags" "The loop never tags." "$D/out.txt"
  if [ -f "$D/docs/epics/RELEASE-DUE.md" ]; then
    ok "RELEASE-DUE.md was written"
    contains "it names what a tag would carry" "What a \`v0.2.0\` tag would carry" "$D/docs/epics/RELEASE-DUE.md"
    contains "and the commits production does not have" "three" "$D/docs/epics/RELEASE-DUE.md"
  else
    bad "RELEASE-DUE.md was not written"
  fi
  absent "the fourth epic was not started" "PICKED EPIC-034" "$D/out.txt"
  if git -C "$D" tag --list 'v*' | grep -qx v0.2.0; then
    bad "the loop created a tag"
  else
    ok "no tag was created"
  fi
  rm -rf "$D"
fi

if want rate-limit; then
head2 "rate-limit — the usage window closes, the runner waits and resumes the same epic"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |'
  epic_files "$D" EPIC-031
  echo ratelimit > "$D/.stub-behaviour"
  PORT="$(fake_staging_ok "$D")"
  run_next "$D" "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT" \
    "AUTONOMOUS_RATE_LIMIT_POLL_S=2" "AUTONOMOUS_STOP_POLL_S=1"
  RC=$?
  stop_fake_staging "$D"
  check "run-next-epic.sh exit code" 0 "$RC"
  check "outcome" "epic-done" "$(outcome_of "$D")"
  contains "it recognised the usage window, from the field not the prose" "usage window exhausted (api-429)" "$D/out.txt"
  contains "it resumed the same epic rather than skipping it" "resuming EPIC-031 at the same step" "$D/out.txt"
  contains "the wait did not count as an attempt" "attempt 1/3" "$D/out.txt"
  rm -rf "$D"
fi

if want human-blocked; then
head2 "human-blocked — rows whose dependency is a person are skipped, named, never ticked"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" \
    '| EPIC-040 | core: version snapshot | M | 030 | blocked |' \
    '| EPIC-041 | web: history | S | 040 | deferred — not scheduled |' \
    '| EPIC-042 | Providers | M | 031 | todo — scoped, not scheduled |' \
    '| EPIC-043 | BYO-key threat model | S | 004 | built — awaiting the staging hand-drive |' \
    '| EPIC-044 | Something Soroush owns | S | — | todo |' \
    '| EPIC-045 | web: the real one | M | 040 | todo |'
  printf '# EPIC-044\n\nThis needs an account on a third-party service, so it waits on Soroush.\n' \
    > "$D/docs/epics/EPIC-044-something.md"
  # EPIC-040 to EPIC-043 are deliberately left unwritten: a row skipped on its status is never
  # read for an epic file, so the status tests above come first and this scenario proves it.
  epic_files "$D" EPIC-045
  PORT="$(fake_staging_ok "$D")"
  run_next "$D" "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT"
  stop_fake_staging "$D"
  check "outcome" "epic-done" "$(outcome_of "$D")"
  contains "blocked is skipped"        "skipped EPIC-040 (blocked) — status blocked" "$D/out.txt"
  contains "deferred is skipped"       "skipped EPIC-041" "$D/out.txt"
  contains "not scheduled is skipped"  "marked not scheduled" "$D/out.txt"
  contains "awaiting a human is skipped" "awaiting a human step" "$D/out.txt"
  contains "an epic file that says it waits on Soroush is skipped, with the line quoted" \
    'waits on Soroush' "$D/out.txt"
  contains "and the one that is actually ours is picked" "PICKED EPIC-045" "$D/out.txt"
  absent "no skipped row was ticked" "| EPIC-040 | core: version snapshot | M | 030 | done |" "$D/docs/backlog.md"
  rm -rf "$D"
fi

if want unwritten; then
head2 "unwritten — a todo row with no epic file stops the loop instead of starting it"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" \
    '| EPIC-030 | core: check model | M | 020 | done |' \
    '| EPIC-031 | worker: pg-boss runner | M | 030 | todo |' \
    '| EPIC-032 | web: input sets | M | 031 | todo |'
  epic_files "$D" EPIC-032   # EPIC-031 is deliberately left unwritten
  PORT="$(fake_staging_ok "$D")"
  run_loop "$D" "STAGING_APEX_URL=http://127.0.0.1:$PORT" "STAGING_APP_URL=http://127.0.0.1:$PORT"
  RC=$?
  stop_fake_staging "$D"
  check "run-epics.sh exit code" 0 "$RC"
  check "outcome" "unwritten-epic" "$(outcome_of "$D")"
  contains "the row is named" "UNWRITTEN EPIC: EPIC-031" "$D/out.txt"
  contains "and the file that is missing" "missing: docs/epics/EPIC-031-<name>.md" "$D/out.txt"
  contains "and why that is a stop" "an epic nobody has written is not an epic a machine should begin" "$D/out.txt"
  contains "and what would move it" "write the epic file, or mark the row" "$D/out.txt"
  contains "the loop stopped rather than going round again" "the next row has no epic file" "$D/out.txt"
  absent  "the unwritten row was not started" "PICKED EPIC-031" "$D/out.txt"
  absent  "and the written row below it was not started in its place" "PICKED EPIC-032" "$D/out.txt"
  absent  "no epic file was invented for it" "EPIC-031-" "$D/docs/backlog.md"
  if ls "$D/docs/epics/" | grep -q '^EPIC-031-'; then
    bad "the runner wrote an epic file for a row nobody has scoped"
  else
    ok "the runner wrote no epic file for it"
  fi
  rm -rf "$D"
fi

if want gate-resolution; then
head2 "gate-resolution — the gate is whatever gates.mjs says it is, with no list kept here"
  D="$(make_fixture)"

  # Writes a fake gates.mjs whose usage line is $2, accepting the modes in $3.
  gates_shaped() {
    cat > "$D/scripts/gates.mjs" <<STUB
#!/usr/bin/env node
const task = process.argv[2];
if (!$2.includes(task ?? "")) { console.error(\`$1\`); process.exit(2); }
console.log("stub gates.mjs ran " + task);
STUB
  }
  plan() { ( cd "$D" && node scripts/gate-run.mjs --explain 2>&1 ); }

  # 1. Today's gates.mjs: three modes, no parity mode, so compliance is not dropped.
  gates_shaped 'usage: node scripts/gates.mjs <test|typecheck|lint>' '["test","typecheck","lint"]'
  plan > "$D/plan.txt"
  contains "today: runs every advertised mode" "will run: gates.mjs test" "$D/plan.txt"
  contains "today: and typecheck"              "will run: gates.mjs typecheck" "$D/plan.txt"
  contains "today: and lint"                   "will run: gates.mjs lint" "$D/plan.txt"
  contains "today: and compliance, which gates.mjs does not cover" "will run: pnpm compliance" "$D/plan.txt"

  # 2. A parity mode arrives as a positional. Nothing in the runner changes.
  gates_shaped 'usage: node scripts/gates.mjs <test|typecheck|lint|ci>' '["test","typecheck","lint","ci"]'
  plan > "$D/plan.txt"
  contains "positional parity mode is picked up" "will run: gates.mjs ci" "$D/plan.txt"
  absent  "and it runs alone"                    "will run: gates.mjs test" "$D/plan.txt"
  absent  "compliance is not run twice"          "will run: pnpm compliance" "$D/plan.txt"

  # 3. A parity mode arrives as a bracketed optional flag.
  gates_shaped 'usage: node scripts/gates.mjs <test|typecheck|lint> [--ci]' '["test","typecheck","lint"]'
  plan > "$D/plan.txt"
  contains "bracketed flag is picked up" "will run: gates.mjs --ci" "$D/plan.txt"
  absent  "and it runs alone"            "will run: gates.mjs lint" "$D/plan.txt"

  # 4. A proper --help, with parity documented as a long flag among others.
  cat > "$D/scripts/gates.mjs" <<'STUB'
#!/usr/bin/env node
console.log(`usage: node scripts/gates.mjs <test|typecheck|lint>

Options:
  --ci-parity   reproduce CI exactly: clean checkout, frozen lockfile, cold cache
  --help        show this`);
process.exit(0);
STUB
  plan > "$D/plan.txt"
  contains "--help output is read too" "will run: gates.mjs --ci-parity" "$D/plan.txt"
  absent  "--help is not mistaken for a gate" "will run: gates.mjs --help" "$D/plan.txt"

  # 5. A mode nobody here has heard of, and only one of them: use it.
  gates_shaped 'usage: node scripts/gates.mjs <test|typecheck|lint|clean-checkout>' '["test","typecheck","lint","clean-checkout"]'
  plan > "$D/plan.txt"
  contains "an unfamiliar single mode is used" "will run: gates.mjs clean-checkout" "$D/plan.txt"

  # 6. The override pins it.
  gates_shaped 'usage: node scripts/gates.mjs <test|typecheck|lint>' '["test","typecheck","lint"]'
  ( cd "$D" && AUTONOMOUS_GATE_MODE="--ci --frozen-lockfile" node scripts/gate-run.mjs --explain ) > "$D/plan.txt" 2>&1
  contains "AUTONOMOUS_GATE_MODE wins" "will run: gates.mjs --ci --frozen-lockfile" "$D/plan.txt"

  # 7. gates.mjs that says nothing about itself must fail, not invent a gate.
  printf '#!/usr/bin/env node\nprocess.exit(2);\n' > "$D/scripts/gates.mjs"
  ( cd "$D" && node scripts/gate-run.mjs --explain ) > "$D/plan.txt" 2>&1
  RC=$?
  check "a silent gates.mjs fails the gate" 2 "$RC"
  absent "and runs nothing" "will run:" "$D/plan.txt"

  rm -rf "$D"
fi

if want no-todo; then
head2 "no-todo — nothing left to do"
  D="$(make_fixture)"; roadmap "$D"
  backlog "$D" \
    '| EPIC-030 | core: check model | M | 020 | done |' \
    '| EPIC-031 | worker: pg-boss runner | M | 030 | done |'
  run_loop "$D"
  RC=$?
  check "run-epics.sh exit code" 0 "$RC"
  check "outcome" "no-todo" "$(outcome_of "$D")"
  contains "it says so" "no todo rows" "$D/out.txt"
  rm -rf "$D"
fi

# =========================================================================================

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
