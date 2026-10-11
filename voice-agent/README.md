# Call Me Maybe: Ava, the doctor's office outreach agent

**Practice outreach (current product):** when a doctor accepts a trial their patients were pre-screened for, **Ava** calls those patients from the doctor's own office and books a screening visit. The doctor does nothing else. Design: [`docs/superpowers/specs/2026-10-11-outbound-caller-design.md`](../docs/superpowers/specs/2026-10-11-outbound-caller-design.md).

The original **speed-to-lead** flow (an ad opt-in triggers a call within seconds) still works and is described further down.

> **Hackathon demo. Not IRB-approved.** Patients are synthetic (Synthea, `../data/`). Study wording comes from the public ClinicalTrials.gov records, simplified. Only teammates' real phones are ever called; everyone else is simulated.

> **Location:** this app lives in `voice-agent/` and will be migrated into the Next.js backend in `site/`. Run every command below from `voice-agent/`.

## Practice outreach

1. **The doctor accepts a trial** (Trials page, or `POST /practices/{id}/trials/{nct}/accept`). The caller builds the call list from that practice's pre-screen candidates (`app/prescreen.py`, reading `../protocols/`). Patients needing chart review aren't called until staff clear them.
2. **Ava calls,** 10 at a time, 9am–8pm in the patient's time zone, Monday to Saturday:
   - She says she's an automated assistant from the doctor's office and that the call is recorded, and asks for the patient by first name.
   - She checks the date of birth through `verify_identity`. **Our server checks it; Ava and the LLM never see it.** Only then does the tool hand her the study one-liner, the approved facts, one line from the chart ("you were in to see Dr. Rivera back in March") and the questions.
   - She asks one or two questions the chart can't answer, then books a screening visit at the office.
3. **No answer:**
   - A voicemail with no study details, if a machine picks up.
   - A text offering 3 real times; replying 1, 2 or 3 books one.
   - A retry the next day at a different time of day.
   - **After 3 tries, the staff queue.**
4. **Text replies:**
   - A number books a time.
   - "After 5" or "mornings" moves the next call.
   - "Not interested" ends this trial's outreach.
   - STOP stops everything.
   - Anything unclear goes to staff.
5. **Callbacks:** when the patient calls the office number back, ElevenLabs asks `/webhooks/elevenlabs/inbound` who it is. Ava greets them, re-checks identity, and picks up the thread. An unknown caller gets a message taken for the staff inbox.
6. **After booking:** a confirmation text with a calendar invite, a reminder the day before, and replies C to confirm or R to reschedule.

**Privacy:**
- **What ElevenLabs gets:** before verification, only the first name, office, doctor and callback number. The birth date stays on our server.
- **Texts and voicemails** never name the study or a condition.
- **Patients are read per practice** (`app/ehr.py`), from Supabase or the committed Synthea file.

**Demo mode:**
- **Real phones:** set `DEMO_PHONES` to teammates' verified numbers. They go to the first candidates.
- **Everyone else is simulated** (`app/simulate_practice.py`). Outcomes are fixed per patient, and texts are logged, never sent.
- **Fast-forward:** `DEMO_DAY_SECONDS=20` makes a "day" between tries last 20 seconds, so the whole 3-day sequence plays out on screen.

```bash
make outreach-demo      # mock mode + fast-forward on http://localhost:8000/dashboard
```

The **office dashboard** (`web/`) has these pages:

| Page | What it shows |
|---|---|
| **Outreach** | KPIs, the stage bar, a patient list with each patient's 3-try sequence, live calls, and the staff queue (call again, I reached them, drop, clear chart review) |
| **Trials** | Candidate counts and the accept button |
| **Calendar** | Booked visits |
| **Inbox** | Unknown callers and texters |

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
uv run pytest                                       # 114 tests
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

The repo-root `vercel.json` deploys the whole repo as one project with three **Services**: `site` (the doctor app), `caller` (this FastAPI app) and `dashboard` (`web/`, the office dashboard and opt-in page). `site` reaches the caller through a service binding (`CALLER_URL`). There is no long-running process on Vercel, so **Vercel Cron** calls `/cron/tick` for retries, queued leads, reminders and stale calls, and calls are dialed inline.

1. Log in and link the project from the repo root: `vercel login`, then `vercel link`.
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
