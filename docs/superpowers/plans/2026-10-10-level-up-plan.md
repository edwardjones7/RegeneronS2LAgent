# Level-up plan (approved by user: "do them all")

Judging: Regeneron HackRU — utility & relevance, readiness (functional, replicable, deployable, GitHub, MIT), design & packaging (~3 min demo video, 10–12 slide deck, intuitive UX, docs).

## Decisions (user)
- Pre-screen questions follow the pasted key inclusion/exclusion criteria exactly (done).
- LLM for drafting campaigns: **Gemini free tier** (`GEMINI_API_KEY`, model `gemini-flash-latest`).
- Deploy target: **Vercel** (CLI needs `vercel login` by the user).

## Architecture changes for Vercel (Claude's calls)
- One Vercel project with **Services**: `web` (Next.js, basePath `/dashboard`) + `api` (FastAPI). Top-level rewrites send `/dashboard/*` and `/demo` to web, everything else to api.
- DB: `DATABASE_URL` → Postgres (Neon via Marketplace) on Vercel; SQLite locally. SQLAlchemy unchanged.
- No long-running worker on Vercel: `/cron/tick` (secret-protected) does retries/queued/reminders/stale settle; Vercel Cron calls it; ticks also piggyback (throttled) on dashboard reads. Locally the asyncio loop calls the same tick.
- Dial inline on Vercel (no BackgroundTasks after response); background task locally.
- Live call state is request-driven: `/calls/live` fetches Twilio call status + ElevenLabs in-progress transcript for active calls (short cache). Dashboard polls fast (1.5s) only while a call is live.
- Campaigns created from an NCT ID are stored in the DB (Vercel FS is read-only); loader merges YAML + DB campaigns. Calls pass the campaign's prompt/first message via per-call overrides, so one agent serves every study.
- Login form posts to `/auth/login` (backend), so it works on both local and Vercel.

## Build order (commit after each)
1. ✅ Criteria-accurate questions with cited criteria
2. ✅ "Not interested" ≠ opt-out
3. Readiness: MIT LICENSE, Dockerfile/compose, one-command `make dev`, README
4. Live call view + real ring/answer stopwatch (Twilio call status + ElevenLabs live transcript)
5. Dashboard motion/polish: toasts, count-up, row animations, funnel chart, hourly activity
6. Coordinator actions (resolve, notes, call back, cancel/reschedule) + calendar view
7. Two-way SMS (confirm/reschedule/stop), day-before reminder, .ics link
8. New campaign from NCT ID (ClinicalTrials.gov + Gemini draft → human review → approve), DB campaigns, per-call overrides
9. Scorecard: persona suite graded with deterministic checks (+ Gemini judge notes), results page
10. Spanish flow (validated/demo-labeled Spanish wording per campaign, language detection)
11. Opt-in page phone mockup
12. Vercel deploy (Services, Neon, cron, env, re-run ElevenLabs setup against prod URL)
13. Deck (Slides artifact) + 3-min video script/shot list
