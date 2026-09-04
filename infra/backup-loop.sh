#!/usr/bin/env bash
# Scheduling wrapper around backup.sh: sleeps until the next 03:00 UTC, runs it, repeats.
# Deliberately not `set -e` around the backup.sh call — a single failed backup should not
# kill this long-running process and stop future nightly attempts; it should be logged and
# retried at the next scheduled time. See infra/RUNBOOK.md for how this shows up in Coolify.
set -u

echo "[backup] scheduler started, nightly at 03:00 UTC"

while true; do
  now_epoch=$(date -u +%s)
  target_epoch=$(date -u -d "today 03:00" +%s)
  if [ "$target_epoch" -le "$now_epoch" ]; then
    target_epoch=$(date -u -d "tomorrow 03:00" +%s)
  fi
  sleep_for=$((target_epoch - now_epoch))
  echo "[backup] sleeping ${sleep_for}s until next run"
  sleep "$sleep_for"

  if /app/backup.sh; then
    echo "[backup] completed successfully at $(date -u -Iseconds)"
  else
    echo "[backup] FAILED at $(date -u -Iseconds) — will retry at next scheduled time"
  fi
done
