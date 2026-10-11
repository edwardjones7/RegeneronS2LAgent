#!/usr/bin/env bash
# Started by cron every minute: ticks every TICK_EVERY seconds for the rest of the minute.
# flock skips a run if the previous one is still going, so slow ticks never pile up.
exec 9>"$HOME/trialist/.tick.lock"
flock -n 9 || exit 0
EVERY="${TICK_EVERY:-10}"
end=$(( $(date +%s) + 58 ))
while [ "$(date +%s)" -lt "$end" ]; do
  start=$(date +%s)
  "$HOME/trialist/tick.sh" >> "$HOME/trialist/tick.log" 2>&1 || true
  wait=$(( EVERY - ($(date +%s) - start) ))
  [ "$wait" -gt 0 ] && [ $(( $(date +%s) + wait )) -lt "$end" ] && sleep "$wait" || break
done
