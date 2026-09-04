#!/usr/bin/env bash
# One-time setup of Claude Code's server access on the operator's Mac (infra/ACCESS.md).
# Creates, outside the repo:
#   ~/.ssh/config          Host 41p-box -> the Lightsail box, using the existing Lightsail key
#   ~/.41prompts/staging.env   COOLIFY_URL + COOLIFY_API_TOKEN, mode 600
# Then verifies both. Idempotent: re-running updates the token and leaves the SSH entry alone.
# Nothing here is written inside the repository; the token is read from the terminal, never
# from an argument (arguments end up in shell history).
set -euo pipefail

BOX_IP="3.97.92.244"
KEY_PATH="$HOME/.ssh/lightsail/LightsailDefaultKey-ca-central-1.pem"
COOLIFY_URL="https://coolify.41prompts.ai"
ENV_DIR="$HOME/.41prompts"
ENV_FILE="$ENV_DIR/staging.env"
SSH_CONFIG="$HOME/.ssh/config"

# 1. SSH alias -------------------------------------------------------------------------------
if [ ! -f "$KEY_PATH" ]; then
  echo "error: Lightsail key not found at $KEY_PATH" >&2
  exit 1
fi
chmod 600 "$KEY_PATH"

mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
touch "$SSH_CONFIG" && chmod 600 "$SSH_CONFIG"
if grep -qE '^Host[[:space:]]+41p-box$' "$SSH_CONFIG"; then
  echo "[ok] ~/.ssh/config already has Host 41p-box"
else
  printf '\nHost 41p-box\n  HostName %s\n  User ubuntu\n  IdentityFile %s\n  IdentitiesOnly yes\n' \
    "$BOX_IP" "$KEY_PATH" >> "$SSH_CONFIG"
  echo "[ok] added Host 41p-box to ~/.ssh/config"
fi

# 2. Coolify API token ----------------------------------------------------------------------
echo
echo "Coolify -> Keys & Tokens -> API tokens -> create with read + deploy only (no root/write/sensitive)."
printf 'Paste the token (input hidden): '
read -r -s TOKEN
echo
if [ -z "$TOKEN" ]; then
  echo "error: empty token" >&2
  exit 1
fi
# Coolify tokens are Laravel Sanctum format "<id>|<random>". Unquoted, the "|" is a pipe when the
# file is sourced and the shell prints the token in a "command not found" error. Single-quote
# every value. A token can never contain a single quote, so refuse one that does.
case "$TOKEN" in
  *"'"*) echo "error: token contains a single quote; refusing to write it" >&2; exit 1 ;;
esac

mkdir -p "$ENV_DIR" && chmod 700 "$ENV_DIR"
umask 077
printf "COOLIFY_URL='%s'\nCOOLIFY_API_TOKEN='%s'\n" "$COOLIFY_URL" "$TOKEN" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "[ok] wrote $ENV_FILE (mode 600)"

# 3. Verify ---------------------------------------------------------------------------------
echo
echo "[check] ssh 41p-box uptime"
ssh -o BatchMode=yes -o ConnectTimeout=10 41p-box uptime

echo "[check] Coolify API"
http_code=$(curl -sS -o /tmp/41p-coolify-version.txt -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" "$COOLIFY_URL/api/v1/version" || true)
if [ "$http_code" = "200" ]; then
  echo "[ok] Coolify API reachable, version $(cat /tmp/41p-coolify-version.txt)"
else
  echo "error: Coolify API returned HTTP $http_code ($(cat /tmp/41p-coolify-version.txt 2>/dev/null))" >&2
  echo "       token pasted wrong, or missing the read permission" >&2
  rm -f /tmp/41p-coolify-version.txt
  exit 1
fi
rm -f /tmp/41p-coolify-version.txt

echo
echo "Done. Tell Claude Code: \"41p-box and ~/.41prompts/staging.env exist and were verified. Proceed to F2.\""
