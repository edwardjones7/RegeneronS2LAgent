#!/usr/bin/env bash
# Stand-in for Vercel Cron: asks the deployed caller to run one worker tick (dial due leads,
# retries, reminders, settle stale calls). Run from cron on any always-on box (we use a Pi).
#
# Reads TRIALIST_URL and CRON_SECRET from ~/.trialist-cron.env (chmod 600), e.g.
#   TRIALIST_URL=https://your-app.vercel.app
#   CRON_SECRET=<same value as the caller's CRON_SECRET on Vercel>
set -euo pipefail
ENV_FILE="${TRIALIST_CRON_ENV:-$HOME/.trialist-cron.env}"
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${TRIALIST_URL:?set TRIALIST_URL in $ENV_FILE}"
: "${CRON_SECRET:?set CRON_SECRET in $ENV_FILE}"

body=$(curl -sS --max-time 120 -w ' %{http_code}' \
  -H "Authorization: Bearer ${CRON_SECRET}" "${TRIALIST_URL%/}/cron/tick") || body="curl-failed 000"
echo "$(date -u +%FT%TZ) ${body}"
