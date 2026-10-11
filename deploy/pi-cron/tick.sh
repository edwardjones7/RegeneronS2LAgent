#!/usr/bin/env bash
# One worker tick on the deployed caller (dial due leads, retries, reminders, stale calls).
set -euo pipefail
source "${TRIALIST_CRON_ENV:-$HOME/.trialist-cron.env}"
: "${TRIALIST_URL:?}" "${CRON_SECRET:?}"
body=$(curl -sS --max-time 55 -w ' %{http_code}' \
  -H "Authorization: Bearer ${CRON_SECRET}" "${TRIALIST_URL%/}/cron/tick" 2>&1) || body="curl-failed: ${body:-}"
echo "$(date -u +%FT%TZ) ${body}"
