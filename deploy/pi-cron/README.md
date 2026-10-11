# Cron from a Raspberry Pi

Vercel's free plan only runs cron jobs once a day. The caller needs a tick every minute or so to dial queued patients, retry missed calls and send reminders. So an always-on box (our Pi) calls the caller's protected tick endpoint instead.

**What it calls:** `GET <TRIALIST_URL>/cron/tick` with `Authorization: Bearer <CRON_SECRET>` (`voice-agent/app/main.py`). Without the right secret it returns 401.

## Setup on the Pi

```bash
mkdir -p ~/trialist && cp tick.sh tick-loop.sh ~/trialist/ && chmod +x ~/trialist/*.sh
umask 077; printf 'TRIALIST_URL=https://trialist-plum.vercel.app\nCRON_SECRET=same-value-as-on-vercel\n' > ~/.trialist-cron.env
~/trialist/tick.sh            # should print: <time> {"dialed":N} 200
```

Crontab (`crontab -e`): cron starts `tick-loop.sh` every minute, and it ticks every 10 seconds (`TICK_EVERY`) for the rest of the minute. `flock` skips a run while the previous one is still going, so slow ticks never pile up. The log keeps its last 5,000 lines.

```cron
* * * * * $HOME/trialist/tick-loop.sh
0 * * * * tail -n 5000 $HOME/trialist/tick.log > $HOME/trialist/tick.log.tmp && mv $HOME/trialist/tick.log.tmp $HOME/trialist/tick.log
```

Watch it: `tail -f ~/trialist/tick.log`.

## On Vercel

- Set `CRON_SECRET` on the caller service (Production) to the same value, then redeploy.
- The URL must be reachable without Vercel's SSO deployment protection. The production domain is.
