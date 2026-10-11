# Cron from a Raspberry Pi

Vercel's free plan only runs cron jobs once a day. The caller needs a tick every minute or so to dial queued patients, retry missed calls and send reminders. So an always-on box (our Pi) calls the caller's protected tick endpoint instead.

**What it calls:** `GET <TRIALIST_URL>/cron/tick` with `Authorization: Bearer <CRON_SECRET>` (`voice-agent/app/main.py`). Without the right secret it returns 401.

## Setup on the Pi

```bash
mkdir -p ~/trialist && cp tick.sh ~/trialist/ && chmod +x ~/trialist/tick.sh
cat > ~/.trialist-cron.env <<'ENV'
TRIALIST_URL=https://your-app.vercel.app
CRON_SECRET=same-value-as-on-vercel
ENV
chmod 600 ~/.trialist-cron.env
~/trialist/tick.sh            # should print: <time> {"dialed":N} 200
```

Crontab (`crontab -e`): every 30 seconds, log kept to the last 2,000 lines:

```cron
* * * * * ~/trialist/tick.sh >> ~/trialist/tick.log 2>&1
* * * * * sleep 30; ~/trialist/tick.sh >> ~/trialist/tick.log 2>&1
0 * * * * tail -n 2000 ~/trialist/tick.log > ~/trialist/tick.log.tmp && mv ~/trialist/tick.log.tmp ~/trialist/tick.log
```

## On Vercel

- Set `CRON_SECRET` on the caller service to the same value.
- The deployment URL must be reachable without Vercel's SSO deployment protection. Use the production domain, or add a protection bypass.
