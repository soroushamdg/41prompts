#!/usr/bin/env bash
# Restores a named R2 backup into a scratch database (never the real one) and prints row
# counts so a human can sanity-check the restore. Used both for the restore drill and for
# an ad-hoc "does this backup actually work" check.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: restore.sh <backup-key>  (e.g. postgres/41p-20260904T030000Z.dump)" >&2
  exit 1
fi

key="$1"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_BUCKET_BACKUPS:?R2_BUCKET_BACKUPS is required}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
scratch_db="restore_drill_41p"
dump_file="/tmp/$(basename "$key")"

echo "[restore] downloading s3://${R2_BUCKET_BACKUPS}/${key}"
aws --endpoint-url "$endpoint" s3 cp "s3://${R2_BUCKET_BACKUPS}/${key}" "$dump_file"

admin_url="$(echo "$DATABASE_URL" | sed -E 's#/[^/]+$#/postgres#')"
scratch_url="$(echo "$DATABASE_URL" | sed -E "s#/[^/]+\$#/${scratch_db}#")"

echo "[restore] (re)creating scratch database ${scratch_db}"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${scratch_db};"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${scratch_db};"

echo "[restore] restoring dump into ${scratch_db}"
pg_restore --no-owner --no-privileges -d "$scratch_url" "$dump_file"

# n_live_tup is planner-statistics estimate, not an exact COUNT(*) — good enough for a
# drill sanity check, and instant even on a large table.
echo "[restore] row counts per table (estimated from planner statistics):"
psql "$scratch_url" -v ON_ERROR_STOP=1 -c "
  SELECT relname AS table_name, n_live_tup AS row_count
  FROM pg_stat_user_tables
  ORDER BY relname;
"

rm -f "$dump_file"
echo "[restore] done — scratch database ${scratch_db} left in place for inspection"
