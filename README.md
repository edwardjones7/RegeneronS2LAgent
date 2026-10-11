# RegeneronS2LAgent

HackRU 2026, Regeneron challenge. Trials come to doctors with the patients already found. Project brief for humans and agents: `.claude/AGENTS.MD`.

## Layout

| Path | What |
|---|---|
| `site/` | Next.js (Pages Router) + Tailwind + Supabase. The main app and backend (API routes). |
| `supabase/migrations/` | Database schema, numbered SQL files. Run them in the Supabase SQL editor, in order. |
| `supabase/seed_patients.py` | Loads the synthetic patients into Supabase, each linked to their practice. |
| `data/` | Synthetic patients (`synthea-nj.json`, 2,000 from Synthea, grouped by county) and the script that regenerates them. |
| `protocols/` | Eligibility criteria for four recruiting trials that Regeneron sponsors or collaborates on, as JSON the matching engine reads. See `protocols/README.md`. |
| `voice-agent/` | Ava, the outbound caller: once a doctor accepts a trial, she calls their pre-screened patients from the doctor's office, handles voicemail, texts, retries and callbacks, and books screening visits. FastAPI + an office dashboard. See `voice-agent/README.md`. |
| `.claude/context/` | Research notes: trial data, sample patient data, Regeneron context. |

## Run the site

```bash
cd site
cp .env.example .env         # fill in Supabase URL + keys
npm install
npm run dev                  # http://localhost:3000, health check at /api/health
```

Checks: `npm run typecheck` and `npm run lint` from `site/`.

## Load the patient data

1. Run each file in `supabase/migrations/` in the Supabase SQL editor.
2. Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `site/.env`.
3. `python3 supabase/seed_patients.py` loads 21 practices and 2,000 patients. Safe to re-run.

## License

Code: MIT (`LICENSE`). Patient data is synthetic, generated with Synthea (Apache-2.0); no real people.
