#!/usr/bin/env bash
#
# The wrapper loop: run epics one after another until there is a reason to stop.
#
# Every reason to stop is a deliberate one, and each is here because leaving it out costs
# something specific:
#
#   the backlog has nothing todo      nothing to do
#   a ▣ GATE row is next              a gate is Soroush's decision; the epics behind it are
#                                     not reachable by skipping past
#   the next row has no epic file     an epic nobody has written is not an epic a machine
#                                     should begin, and an unwritten row cannot say whether
#                                     it needs a person
#   two consecutive BLOCKERs          one blocker is a hard epic; two in a row means
#                                     something upstream is wrong and every further epic is
#                                     paying for it
#   three completed epics             staging has drifted three epics further from production
#                                     and the eventual release is getting bigger
#   staging is not serving            an epic whose browser drive cannot pass must not start
#   a run exited non-zero             the runner could not proceed
#   the STOP file appeared            Soroush said stop
#   SIGTERM                           the same, from the process table
#
#   scripts/run-epics.sh              run until one of the above
#   scripts/run-epics.sh --dry-run    pass --dry-run to every epic; invokes no model
#
# To stop it: `touch STOP` in the repository root, or `kill $(cat .run-epics.pid)`. STOP is
# read between epics and again every few seconds during one, so it lands mid-epic too.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 5

LOG="${AUTONOMOUS_LOG:-$REPO/docs/epics/sessions/autonomous-run.log}"
STOP_FILE="${AUTONOMOUS_STOP_FILE:-$REPO/STOP}"
PID_FILE="${AUTONOMOUS_PID_FILE:-$REPO/.run-epics.pid}"
OUTCOME_FILE="$REPO/docs/epics/.run-outcome.json"
RELEASE_DUE="$REPO/docs/epics/RELEASE-DUE.md"
# Three, not ten. The reasoning is in docs/AUTONOMOUS.md.
EPICS_PER_RELEASE="${AUTONOMOUS_EPICS_PER_RELEASE:-3}"
DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN="--dry-run"

mkdir -p "$(dirname "$LOG")"

log() {
  printf '%s  [loop] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG"
}

# --- one loop at a time -----------------------------------------------------------------

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    log "another loop is already running (pid $OLD_PID) — refusing to start a second"
    exit 1
  fi
  log "clearing a stale pid file (pid $OLD_PID is gone)"
  rm -f "$PID_FILE"
fi
printf '%s\n' "$$" > "$PID_FILE"

CHILD_PID=""
cleanup() { rm -f "$PID_FILE"; }
on_term() {
  log "SIGTERM — stopping after the current epic is told to stop"
  if [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill -TERM "$CHILD_PID" 2>/dev/null
    wait "$CHILD_PID" 2>/dev/null
  fi
  cleanup
  exit 0
}
trap cleanup EXIT
trap on_term TERM INT

# --- a restart is the resume signal ------------------------------------------------------
#
# The release counter resets on every start. Soroush restarting the loop is exactly how he
# says "I have dealt with the release"; a counter that survived a restart would stop the loop
# again on its first epic.

COMPLETED_SINCE_RELEASE=0
CONSECUTIVE_BLOCKERS=0
EPICS_DONE=0
# Ordinary endings exit 0. A failure the operator should see — staging down, a run that could
# not finish, the usage window never reopening — exits with the runner's own code, so a cron
# entry or a systemd unit notices rather than recording a tidy success.
FINAL_RC=0

if [ -f "$RELEASE_DUE" ]; then
  log "$RELEASE_DUE still exists from a previous stop — the release counter resets anyway, because restarting the loop is the signal that you have dealt with it"
fi

log "starting${DRY_RUN:+ (dry run)} — stop with \`touch $STOP_FILE\` or \`kill $$\`"
log "pid file: $PID_FILE"

while :; do
  if [ -f "$STOP_FILE" ]; then
    log "STOP file present at $STOP_FILE — stopping between epics"
    break
  fi

  rm -f "$OUTCOME_FILE"
  "$REPO/scripts/run-next-epic.sh" $DRY_RUN &
  CHILD_PID=$!
  wait "$CHILD_PID"
  RC=$?
  CHILD_PID=""

  OUTCOME="unknown"
  EPIC=""
  if [ -f "$OUTCOME_FILE" ]; then
    OUTCOME="$(node -e 'const j=require(process.argv[1]);process.stdout.write(j.outcome??"unknown")' "$OUTCOME_FILE" 2>/dev/null || echo unknown)"
    EPIC="$(node -e 'const j=require(process.argv[1]);process.stdout.write(j.epic??"")' "$OUTCOME_FILE" 2>/dev/null || echo "")"
  fi

  case "$OUTCOME" in
    epic-done)
      EPICS_DONE=$((EPICS_DONE + 1))
      CONSECUTIVE_BLOCKERS=0
      COMPLETED_SINCE_RELEASE=$((COMPLETED_SINCE_RELEASE + 1))
      log "$EPIC completed ($COMPLETED_SINCE_RELEASE of $EPICS_PER_RELEASE since the last release)"
      if [ "$COMPLETED_SINCE_RELEASE" -ge "$EPICS_PER_RELEASE" ]; then
        log "$EPICS_PER_RELEASE epics completed — writing $RELEASE_DUE and stopping. The loop never tags."
        node scripts/release-due.mjs 2>&1 | sed 's/^/  /' | tee -a "$LOG"
        break
      fi
      ;;

    blocker)
      CONSECUTIVE_BLOCKERS=$((CONSECUTIVE_BLOCKERS + 1))
      log "$EPIC ended in a BLOCKER ($CONSECUTIVE_BLOCKERS consecutive)"
      if [ "$CONSECUTIVE_BLOCKERS" -ge 2 ]; then
        log "two epics in a row ended in a BLOCKER — stopping. One is a hard epic; two means something upstream is wrong and every further epic is paying for it."
        log "read docs/epics/BLOCKER-*.md, then restart the loop once the cause is fixed"
        break
      fi
      ;;

    gate-stop)
      log "stopped at a gate — nothing behind it starts until it is decided"
      break
      ;;

    no-todo)
      log "the backlog has no todo rows left — stopping"
      break
      ;;

    unwritten-epic)
      log "the next row has no epic file — stopping. Write it, or mark the row, and restart."
      break
      ;;

    stopped)
      log "the epic runner stopped (STOP or a signal) — stopping the loop"
      break
      ;;

    dry-run)
      log "dry run: one pick printed, nothing invoked — stopping so the loop does not spin"
      break
      ;;

    *)
      log "run-next-epic.sh exited $RC with outcome '$OUTCOME' — stopping"
      FINAL_RC=$RC
      break
      ;;
  esac

  if [ "$RC" -ne 0 ]; then
    log "run-next-epic.sh exited $RC — stopping"
    FINAL_RC=$RC
    break
  fi
done

log "loop finished — $EPICS_DONE epic(s) completed this run, exit $FINAL_RC"
cleanup
exit "$FINAL_RC"
