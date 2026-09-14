#!/usr/bin/env bash
#
# One epic, unattended. Picks it, checks staging can carry it, runs Claude Code headless
# against docs/AUTONOMOUS.md, and exits when the epic is done or when it cannot proceed.
#
# This script does not decide what an epic is or how to build it — docs/AUTONOMOUS.md does,
# and the run reads it. What lives here is everything that has to be true before and after a
# run rather than during it: the pick, the preflight, the resume point, the rate-limit wait,
# and the log.
#
#   scripts/run-next-epic.sh            run it
#   scripts/run-next-epic.sh --dry-run  print the pick and the exact command, invoke nothing
#
# Exit codes, which scripts/run-epics.sh reads:
#   0  the epic completed, or the backlog had nothing to do, or a gate stopped us, or the next
#      todo row had no epic file, or a BLOCKER was written, or the STOP file appeared. All of
#      these are ordinary endings.
#   3  staging is not serving — an epic must not start when its browser drive cannot pass
#   4  the run did not finish the epic after AUTONOMOUS_MAX_ATTEMPTS resumes
#   5  the runner itself failed
#   6  the usage window did not reset inside AUTONOMOUS_RATE_LIMIT_MAX_WAIT_S

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 5

LOG="${AUTONOMOUS_LOG:-$REPO/docs/epics/sessions/autonomous-run.log}"
STOP_FILE="${AUTONOMOUS_STOP_FILE:-$REPO/STOP}"
STATE_FILE="$REPO/docs/epics/.run-state.json"
OUTCOME_FILE="$REPO/docs/epics/.run-outcome.json"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
MODEL="${AUTONOMOUS_MODEL:-opus}"
MAX_ATTEMPTS="${AUTONOMOUS_MAX_ATTEMPTS:-3}"
# Six hours covers a five-hour window plus slack. Beyond that something other than a rate
# limit is wrong and waiting longer is just a quieter failure.
RATE_LIMIT_MAX_WAIT_S="${AUTONOMOUS_RATE_LIMIT_MAX_WAIT_S:-21600}"
STOP_POLL_S="${AUTONOMOUS_STOP_POLL_S:-10}"
RETRY_BACKOFF_S="${AUTONOMOUS_RETRY_BACKOFF_S:-30}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$(dirname "$LOG")"

log() {
  printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG"
}

# The one line the wrapper reads. Written before every exit so an interrupted loop still
# leaves behind what the last invocation concluded.
outcome() {
  local name="$1" detail="${2:-}" epic="${3:-}"
  printf '{"outcome":%s,"epic":%s,"detail":%s,"at":%s}\n' \
    "$(json_string "$name")" "$(json_string "$epic")" "$(json_string "$detail")" \
    "$(json_string "$(date -u '+%Y-%m-%dT%H:%M:%SZ')")" > "$OUTCOME_FILE"
  log "OUTCOME $name${epic:+ [$epic]}${detail:+ — $detail}"
}

json_string() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""))' "$1"
}

stop_requested() {
  [ -f "$STOP_FILE" ]
}

# Sleep that can be interrupted by the STOP file. A rate-limit wait is hours long and a STOP
# that is only read between epics would be ignored for all of it.
interruptible_sleep() {
  local remaining="$1"
  while [ "$remaining" -gt 0 ]; do
    if stop_requested; then return 1; fi
    local chunk=$STOP_POLL_S
    [ "$remaining" -lt "$chunk" ] && chunk=$remaining
    sleep "$chunk"
    remaining=$((remaining - chunk))
  done
  return 0
}

# ---------------------------------------------------------------------------------------
# STOP, before anything else
# ---------------------------------------------------------------------------------------

if stop_requested; then
  log "STOP file present at $STOP_FILE — not starting an epic"
  outcome "stopped" "STOP file present before the pick"
  exit 0
fi

# ---------------------------------------------------------------------------------------
# Resume, or pick
# ---------------------------------------------------------------------------------------

RESUMING=0
EPIC=""
EPIC_TITLE=""
STAGE=""
BRANCH=""
NEXT_STEP=""

if [ -f "$STATE_FILE" ]; then
  IFS=$'\t' read -r EPIC EPIC_TITLE STAGE BRANCH LAST_STEP NEXT_STEP \
    < <(node scripts/run-state.mjs get --tsv 2>/dev/null)
  if [ -n "${EPIC:-}" ]; then
    # The state file is only a resume point while the backlog still says the epic is todo.
    # A row that has flipped to done means the epic finished and the file outlived it.
    # Asked of the same parser that does the picking, so the two cannot disagree.
    ROW_STATUS="$(node scripts/pick-next-epic.mjs --status "$EPIC")"
    if [ "$ROW_STATUS" = "todo" ]; then
      RESUMING=1
      log "RESUME $EPIC — last completed step was '${LAST_STEP:-(none)}', resuming at '$NEXT_STEP'"
    else
      log "state file names $EPIC but its backlog row is now '${ROW_STATUS:-missing}' — clearing it and picking fresh"
      node scripts/run-state.mjs clear >/dev/null
      EPIC=""; EPIC_TITLE=""; STAGE=""; BRANCH=""; NEXT_STEP=""
    fi
  fi
fi

if [ "$RESUMING" -eq 0 ]; then
  PICK="$(node scripts/pick-next-epic.mjs --json)" || { log "pick failed"; outcome "failed" "pick-next-epic.mjs exited non-zero"; exit 5; }
  IFS=$'\t' read -r PICK_OUTCOME PICK_ID PICK_TITLE PICK_STAGE PICK_BRANCH \
    < <(node scripts/pick-next-epic.mjs --tsv)

  case "$PICK_OUTCOME" in
    none)
      # Every skipped row is named, so "nothing to do" is never confused with "nothing left".
      printf '%s' "$PICK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);for(const k of r.skipped) if(!/^status done$/.test(k.reason)) console.log(`  skipped ${k.id} (${k.status}) — ${k.reason}`)})' | tee -a "$LOG"
      log "no todo rows in docs/backlog.md"
      outcome "no-todo" "the backlog has no pickable todo row"
      exit 0
      ;;
    gate)
      # Requirement: a gate is Soroush's decision. The loop never reaches past one.
      GATE_ID="$PICK_ID"
      log "GATE REACHED: $GATE_ID — this is Soroush's decision, the loop stops here"
      printf '%s' "$PICK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const g=JSON.parse(s).gate;console.log(`  ${g.id} — ${g.title}`);console.log("  what it requires:");for(const l of (g.criteria??"(criteria not found in docs/roadmap.md)").split("\n")) console.log(`    ${l}`)})' | tee -a "$LOG"
      outcome "gate-stop" "$GATE_ID must be decided before anything behind it starts" "$GATE_ID"
      exit 0
      ;;
    unwritten)
      # A `todo` row nobody has written an epic file for. A stop, not a skip: the row is not
      # known to be ready and it is not known to be human-blocked either, because the file is
      # where an epic would say so. EPIC-006 is the case — every one of its tasks needed
      # Soroush's accounts and a payment method, and with no file nothing said so.
      UNWRITTEN_ID="$PICK_ID"
      log "UNWRITTEN EPIC: $UNWRITTEN_ID — $PICK_TITLE"
      log "  an epic nobody has written is not an epic a machine should begin; the loop stops here"
      printf '%s' "$PICK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);for(const k of r.skipped) if(k.reason!=="status done") console.log(`  skipped ${k.id} (${k.status}) — ${k.reason}`);const w=r.row;console.log(`  stage:   ${r.stage}`);console.log(`  status:  ${w.status}`);console.log(`  missing: ${w.expected}`);console.log("  to start it: write the epic file, or mark the row deferred/blocked with the reason")})' | tee -a "$LOG"
      outcome "unwritten-epic" "$UNWRITTEN_ID is todo with no docs/epics/$UNWRITTEN_ID-*.md" "$UNWRITTEN_ID"
      exit 0
      ;;
    pick) ;;
    *)
      log "pick returned an unknown outcome: $PICK_OUTCOME"
      outcome "failed" "unknown pick outcome $PICK_OUTCOME"
      exit 5
      ;;
  esac

  EPIC="$PICK_ID"
  EPIC_TITLE="$PICK_TITLE"
  STAGE="$PICK_STAGE"
  BRANCH="$PICK_BRANCH"
  NEXT_STEP="epic-file"

  printf '%s' "$PICK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);for(const k of r.skipped) if(k.reason!=="status done") console.log(`  skipped ${k.id} (${k.status}) — ${k.reason}`)})' | tee -a "$LOG"
  log "PICKED $EPIC — $EPIC_TITLE"
  log "  stage:  $STAGE"
  log "  branch: $BRANCH"
fi

# ---------------------------------------------------------------------------------------
# Preflight: staging must be serving, not merely answering
# ---------------------------------------------------------------------------------------

log "checking staging before starting $EPIC"
STAGING_OUT="$(node scripts/check-staging.mjs 2>&1)"
STAGING_RC=$?
printf '%s\n' "$STAGING_OUT" | sed 's/^/  /' | tee -a "$LOG" >/dev/null
printf '%s\n' "$STAGING_OUT" | sed 's/^/  /'
if [ $STAGING_RC -ne 0 ]; then
  log "staging is not serving — refusing to start $EPIC, because its browser drive could not pass"
  outcome "staging-down" "check-staging.mjs failed; see the log for which check" "$EPIC"
  exit 3
fi

# ---------------------------------------------------------------------------------------
# The command
# ---------------------------------------------------------------------------------------

PROMPT="Read docs/AUTONOMOUS.md and follow it exactly. It is the standing instruction for this run.

Epic: $EPIC — $EPIC_TITLE
Stage: $STAGE
Branch: $BRANCH
Resume at step: $NEXT_STEP

Record each completed step with \`node scripts/run-state.mjs set --step <step>\` as you finish
it, and \`node scripts/run-state.mjs clear\` when the epic is complete. Every step before
'$NEXT_STEP' is already done and on disk — verify rather than redo it. Do not ask a question;
docs/AUTONOMOUS.md says what to do instead."

# `--output-format json` rather than text: the result object is where the rate-limit signal
# lives, and reading a field beats matching a sentence. No `--verbose` — it interleaves stream
# messages into the same stdout the result is parsed from.
set -- "$CLAUDE_BIN" -p --dangerously-skip-permissions --model "$MODEL" --output-format json
[ -n "${AUTONOMOUS_MAX_BUDGET_USD:-}" ] && set -- "$@" --max-budget-usd "$AUTONOMOUS_MAX_BUDGET_USD"

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY RUN — would invoke:"
  {
    printf '    '
    for a in "$@"; do printf '%q ' "$a"; done
    printf '\\\n      <<PROMPT\n'
    printf '%s\n' "$PROMPT" | sed 's/^/      /'
    printf '      PROMPT\n'
  } | tee -a "$LOG"
  outcome "dry-run" "picked $EPIC, resume step $NEXT_STEP, invoked nothing" "$EPIC"
  exit 0
fi

node scripts/run-state.mjs start --epic "$EPIC" --title "$EPIC_TITLE" --stage "$STAGE" --branch "$BRANCH" >/dev/null

# ---------------------------------------------------------------------------------------
# Run, with STOP honoured mid-epic and the usage window waited out
# ---------------------------------------------------------------------------------------

RUN_DIR="$(mktemp -d)"
trap 'rm -rf "$RUN_DIR"' EXIT

CLAUDE_PID=""
terminate() {
  if [ -n "$CLAUDE_PID" ] && kill -0 "$CLAUDE_PID" 2>/dev/null; then
    log "terminating the run (pid $CLAUDE_PID)"
    kill -TERM "$CLAUDE_PID" 2>/dev/null
    # Give it ten seconds to write its state file, then stop asking.
    for _ in $(seq 1 10); do
      kill -0 "$CLAUDE_PID" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$CLAUDE_PID" 2>/dev/null
  fi
}
trap 'log "SIGTERM received"; terminate; outcome "stopped" "SIGTERM" "$EPIC"; exit 0' TERM
trap 'log "SIGINT received"; terminate; outcome "stopped" "SIGINT" "$EPIC"; exit 0' INT

ATTEMPT=0
WAITED_S=0

while :; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -gt "$MAX_ATTEMPTS" ]; then
    log "$EPIC did not complete after $MAX_ATTEMPTS attempts"
    outcome "incomplete" "still at step $(node scripts/run-state.mjs get --tsv 2>/dev/null | cut -f6) after $MAX_ATTEMPTS attempts" "$EPIC"
    exit 4
  fi

  OUT="$RUN_DIR/attempt-$ATTEMPT.json"
  log "invoking Claude Code for $EPIC (attempt $ATTEMPT/$MAX_ATTEMPTS, resuming at $NEXT_STEP)"

  printf '%s' "$PROMPT" | "$@" > "$OUT" 2>"$RUN_DIR/attempt-$ATTEMPT.err" &
  CLAUDE_PID=$!

  # Watch for STOP while it runs. This is the half of the STOP contract that matters:
  # between epics is easy, mid-epic is the one that has to actually reach the process.
  STOPPED_MID_EPIC=0
  while kill -0 "$CLAUDE_PID" 2>/dev/null; do
    if stop_requested; then
      log "STOP file appeared mid-epic — stopping $EPIC at whatever step it reached"
      STOPPED_MID_EPIC=1
      terminate
      break
    fi
    sleep "$STOP_POLL_S"
  done
  wait "$CLAUDE_PID"
  CLAUDE_RC=$?
  CLAUDE_PID=""

  if [ "$STOPPED_MID_EPIC" -eq 1 ]; then
    # The state file is deliberately left in place: it is the resume point for whenever
    # Soroush removes the STOP file.
    outcome "stopped" "STOP file appeared mid-epic; state kept for resume" "$EPIC"
    exit 0
  fi

  # What the run said it did, into the log, so the log answers "what it decided" without
  # anyone opening a transcript.
  node -e '
    const fs = require("fs");
    let last = null;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      try { const p = JSON.parse(t); if (p.type === "result" || p.subtype) last = p; } catch {}
    }
    if (!last) { process.stdout.write("(no result object — the run produced no parseable output)\n"); process.exit(0); }
    process.stdout.write(`subtype=${last.subtype} turns=${last.num_turns ?? "?"} cost=$${(last.total_cost_usd ?? 0).toFixed(2)} terminal_reason=${last.terminal_reason ?? "?"}\n`);
    if (last.result) process.stdout.write(String(last.result).split("\n").slice(0, 12).join("\n") + "\n");
  ' "$OUT" 2>/dev/null | sed 's/^/  said: /' | tee -a "$LOG"

  # --- did the usage window run out? -------------------------------------------------
  # Read from the result object, not from prose: `api_error_status` is the field Claude
  # Code fills in from the API's own status, and 429 is the usage window saying no.
  RATE_LIMITED="$(node scripts/rate-limit.mjs classify "$OUT" "$RUN_DIR/attempt-$ATTEMPT.err")"
  if [ "$RATE_LIMITED" != "no" ]; then
    RESET_IN_S="$(node scripts/rate-limit.mjs wait-seconds "$OUT" "$RUN_DIR/attempt-$ATTEMPT.err")"
    log "usage window exhausted ($RATE_LIMITED) — sleeping ${RESET_IN_S}s, then resuming $EPIC at the same step"
    if [ $((WAITED_S + RESET_IN_S)) -gt "$RATE_LIMIT_MAX_WAIT_S" ]; then
      log "that would exceed AUTONOMOUS_RATE_LIMIT_MAX_WAIT_S=$RATE_LIMIT_MAX_WAIT_S"
      outcome "rate-limit-timeout" "waited ${WAITED_S}s; next wait ${RESET_IN_S}s exceeds the cap" "$EPIC"
      exit 6
    fi
    if ! interruptible_sleep "$RESET_IN_S"; then
      log "STOP file appeared during the rate-limit wait"
      outcome "stopped" "STOP during the rate-limit wait; state kept for resume" "$EPIC"
      exit 0
    fi
    WAITED_S=$((WAITED_S + RESET_IN_S))
    # A rate-limit wait is not an attempt at the epic — nothing was tried.
    ATTEMPT=$((ATTEMPT - 1))
    continue
  fi

  # --- did it finish? -----------------------------------------------------------------
  BLOCKER="docs/epics/BLOCKER-$EPIC.md"
  if [ -f "$BLOCKER" ]; then
    log "$EPIC wrote $BLOCKER and stopped"
    head -20 "$BLOCKER" | sed 's/^/  /' | tee -a "$LOG" >/dev/null
    node scripts/run-state.mjs clear >/dev/null
    # Exit 0: a blocker is an epic ending, not a runner failure. The wrapper counts them
    # and stops on the second in a row.
    outcome "blocker" "$BLOCKER" "$EPIC"
    exit 0
  fi

  if [ ! -f "$STATE_FILE" ]; then
    log "$EPIC complete — the run cleared its state file"
    outcome "epic-done" "completed in $ATTEMPT attempt(s)" "$EPIC"
    exit 0
  fi

  NEXT_STEP="$(node scripts/run-state.mjs get --tsv | cut -f6)"
  if [ "$CLAUDE_RC" -ne 0 ]; then
    log "Claude Code exited $CLAUDE_RC with $EPIC unfinished at step $NEXT_STEP"
    tail -5 "$RUN_DIR/attempt-$ATTEMPT.err" 2>/dev/null | sed 's/^/  stderr: /' | tee -a "$LOG" >/dev/null
    # Back off before resuming. A run that fails in two seconds — a missing binary, a broken
    # auth token — would otherwise burn all three attempts before anyone could read the first
    # error, and the log would say "3 attempts" about six seconds of work.
    if ! interruptible_sleep "$RETRY_BACKOFF_S"; then
      log "STOP file appeared during the retry backoff"
      outcome "stopped" "STOP during the retry backoff; state kept for resume" "$EPIC"
      exit 0
    fi
  else
    log "the run ended with $EPIC unfinished at step $NEXT_STEP — resuming"
  fi
done
