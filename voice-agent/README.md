# Call Me Maybe: speed-to-lead voice agent for clinical trials

When someone opts in to a clinical-trial ad, **Ava** calls them within seconds. She says up front that she's an automated assistant and that the call is recorded, explains the study in one plain sentence, and runs the pre-screen questions conversationally. She answers questions **only from approved study facts**, books a screening visit on the call, and texts a confirmation to the patient and an alert to the coordinator.

> **Hackathon demo. Not IRB-approved.** The study wording is drawn from the public ClinicalTrials.gov record **[NCT07685808](https://clinicaltrials.gov/study/NCT07685808)** (Regeneron, olatorepatide, Phase 2, adults with overweight/obesity without diabetes). Clinic details, slots, and phone numbers are demo data. Only call teammates' phones.

> **Location:** this app lives in `voice-agent/` and will be migrated into the Next.js backend in `site/`. Run every command below from `voice-agent/`. The Vercel project for it needs its Root Directory set to `voice-agent`.

## What's in it

- **Live call view:** a stopwatch from opt-in to the phone ringing and being answered (from Twilio call status), a live transcript, and a question tracker.
- **Safety scorecard:** every persona from the brief (interested, not a fit, confused, hard of hearing, Spanish, angry, chest pain, wants a human, medical and off-script questions) is run against the live agent and graded deterministically.
- **New campaign from any NCT ID:**
  - ClinicalTrials.gov plus Gemini (free tier) draft the script.
  - Every fact must quote the record, or it's dropped.
  - A coordinator edits and approves it before go-live.
  - One agent serves every study through per-call script overrides.
- **Coordinator actions:** resolve flags, add notes, have Ava call again, and reschedule or cancel visits. A calendar view shows booked visits.
- **Two-way texting:** patients reply C to confirm, R to reschedule (then pick 1, 2 or 3), or CANCEL; anything else is forwarded to the coordinator. Day-before reminders and `.ics` calendar links are included.
- **Spanish:** Ava uses pre-written Spanish wording only (labeled as a demo translation, not validated). Other languages get a human callback.
- **"Not interested" is not a do-not-call:** only an explicit request stops future calls.

## How it works

```
 ad / form ──POST /leads──▶ FastAPI ──outbound-call──▶ ElevenLabs Agent ◀──▶ Twilio ◀──▶ 📞 patient
                              ▲   (consent, do-not-call,      │  (voice, turn-taking, Claude LLM)
                              │    calling hours checked)      │
                              └──── /tools/* (mid-call) ◀──────┘   record_answer · get_open_slots · book_visit
                              └──── /webhooks/elevenlabs ◀─────┘   opt_out · escalate_to_human · flag_emergency
                                    (transcript, summary)
            SQLite (leads, answers, calls, events, slots, do-not-call) ──▶ read API ──▶ dashboard (next phase)
            Twilio SMS: patient confirmation + coordinator alert, only when a visit is booked
```

- **The backend decides fit, not the LLM.** Every answer goes through `record_answer`, which is scored in `app/screening.py`. BMI is computed from height and weight. That tool also tells Ava the next question, so question order and wording always come from the campaign file. `get_open_slots` and `book_visit` refuse to run until the answers fit.
- **One YAML per study** (`campaigns/*.yaml`) holds the one-liner, the approved facts (each tagged `ctgov` or `demo`), the questions and fit rules, calling hours, and the coordinator. The agent prompt is generated from it (`app/prompt.py`).
- **Safety behaviour:** emergency → "hang up and call 911", call ends, coordinator alerted. Medical questions are declined and flagged. "Stop calling me" puts the number on a do-not-call list checked before every dial. A request for a human transfers live to the coordinator. A non-English speaker gets a callback from a person. Calls only happen with consent and inside calling hours (in the lead's timezone). Unanswered calls get up to 2 retries.

## Run it with no accounts (mock mode)

```bash
uv sync
uv run python scripts/mock_call.py --persona all   # 7 scripted calls through the real backend
uv run pytest                                       # 82 tests
```

## Run it for real

1. `cp .env.example .env`, then add your ElevenLabs and Twilio keys and a Twilio number. On a trial account, verify the teammate phones you'll call. Set `coordinator_phone` in the campaign YAML to a teammate's phone.
2. Start the server and a tunnel:
   ```bash
   uv run uvicorn app.main:app --port 8000
   cloudflared tunnel --url http://localhost:8000     # put the https URL in PUBLIC_BASE_URL, set MOCK_MODE=false
   ```
3. `uv run python scripts/setup_elevenlabs.py`. This creates or updates the agent, tools, tool secret, webhook, and Twilio number import. Re-run it whenever the tunnel URL changes, then restart the server.
4. Open `http://localhost:8000/demo`, enter a teammate's phone, tick consent, and submit. The phone rings.

**Without a phone:** `uv run python scripts/text_call.py --persona all` holds real text conversations with the live agent, so the real LLM and real tool calls are exercised. `scripts/browser_test.py` sets up a lead so you can talk to Ava from the ElevenLabs dashboard.

## Coordinator dashboard

`web/` is a Next.js + shadcn/ui app, statically exported and served by FastAPI at **`/dashboard`**. It runs on the same origin, so there's no second server. Sign in with `DASHBOARD_PASSWORD` (falls back to `READ_API_KEY`).

```bash
cd web && npm ci && npm run build      # outputs web/out, picked up by the server
npm run dev                            # optional: hot reload at :3000/dashboard, proxied to :8000 (sign in on :8000 first)
```

It shows live KPIs (median opt-in-to-call time, reached, booked, needs a human), an outcome breakdown, a filterable lead table, an attention queue, and a lead panel with the summary, flags, pre-screen answers, consent, recording, transcript and activity. Coordinator texts deep-link to `/dashboard/leads/{id}`.

Performance:
- Static HTML shell with skeletons, so first paint needs no data.
- Self-hosted Geist fonts.
- `LazyMotion` (dom animations only).
- The lead panel is code-split and loads on demand.
- Polling pauses while the tab is hidden.
- Gzip on, hashed assets cached as immutable.

## Deploy on Vercel

`vercel.json` defines two **Services** in one project: `web` (the Next.js dashboard and opt-in page) and `api` (FastAPI). There is no long-running process on Vercel, so **Vercel Cron** calls `/cron/tick` for retries, queued leads, reminders and stale calls, and calls are dialed inline.

1. Log in and link the project: `vercel login`, then `vercel link`.
2. Add Postgres (Neon) from the Marketplace: `vercel integration add neon`. This sets `DATABASE_URL`.
3. Add the env vars from `.env.example`, plus `CRON_SECRET`, `DASHBOARD_PASSWORD` and `GEMINI_API_KEY`: `vercel env add …`.
4. Run `vercel --prod`. Then set `PUBLIC_BASE_URL` to the production URL and run `make elevenlabs` so ElevenLabs and Twilio point at it.

Hobby plans only allow daily crons. On Hobby, change the schedule in `vercel.json`; retries then run when the cron fires.

## Read API (dashboard source of truth)

Send the `X-API-Key: $READ_API_KEY` header.
- `GET /campaigns/{id}`: counts by status, median seconds from opt-in to call, leads needing attention
- `GET /campaigns/{id}/leads?status=booked`
- `GET /leads/{id}`: consent, screening answers + verdicts + BMI, calls with transcript and summary, event timeline, visit
- `GET /leads/{id}/calls/{call_id}/recording`: audio, proxied from ElevenLabs

## Layout

`app/` (FastAPI app: `screening.py`, `hours.py`, `slots.py`, `service.py`, `prompt.py`, `voice.py`, `sms.py`, `routes/`) · `campaigns/` (study files + the ClinicalTrials.gov source snapshot) · `scripts/` (setup, mock, text and browser tests) · `docs/` (design, plan, ElevenLabs API notes)

## Sources

- ClinicalTrials.gov NCT07685808, retrieved 2026-10-10 via the [ClinicalTrials.gov API](https://clinicaltrials.gov/data-api/about-api); snapshot in `campaigns/sources/`
- Site enrollment statistics: [Tufts CSDD via Fierce Biotech](https://www.fiercebiotech.com/biotech/new-research-from-tufts-center-for-study-of-drug-development-characterizes-effectiveness)
- AI voices and the TCPA: [Cooley on the FCC's 2024 ruling](https://cooley.com/news/insight/2024/2024-02-15-fcc-ai-generated-robocalls-illegal-under-the-tcpa)
- [ElevenLabs Agents docs](https://elevenlabs.io/docs) (see `docs/notes/elevenlabs-api.md`) · [Twilio Programmable Messaging](https://www.twilio.com/docs/messaging)
