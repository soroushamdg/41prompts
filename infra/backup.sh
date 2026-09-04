#!/usr/bin/env bash
# Single-shot backup: dump the database, upload it to R2, prune backups older than 30 days.
# Exits non-zero on any failure (set -e) so whatever runs this — the backup service's loop,
# or a human running it by hand — sees a clear failure.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_BUCKET_BACKUPS:?R2_BUCKET_BACKUPS is required}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
prefix="postgres"
retention_days=30

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="/tmp/41p-${timestamp}.dump"
key="${prefix}/41p-${timestamp}.dump"

echo "[backup] dumping database to ${dump_file}"
pg_dump "$DATABASE_URL" -F c -Z 9 -f "$dump_file"

echo "[backup] uploading to s3://${R2_BUCKET_BACKUPS}/${key}"
aws --endpoint-url "$endpoint" s3 cp "$dump_file" "s3://${R2_BUCKET_BACKUPS}/${key}"

rm -f "$dump_file"

echo "[backup] pruning objects older than ${retention_days} days"
cutoff="$(date -u -d "-${retention_days} days" +%Y-%m-%dT%H:%M:%SZ)"
stale_keys="$(aws --endpoint-url "$endpoint" s3api list-objects-v2 \
  --bucket "$R2_BUCKET_BACKUPS" \
  --prefix "${prefix}/" \
  --query "Contents[?LastModified<='${cutoff}'].Key" \
  --output text)"

if [ -n "$stale_keys" ] && [ "$stale_keys" != "None" ]; then
  for stale_key in $stale_keys; do
    echo "[backup] deleting stale object ${stale_key}"
    aws --endpoint-url "$endpoint" s3 rm "s3://${R2_BUCKET_BACKUPS}/${stale_key}"
  done
else
  echo "[backup] nothing older than ${retention_days} days"
fi

echo "[backup] done: ${key}"
