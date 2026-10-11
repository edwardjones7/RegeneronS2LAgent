# RegeneronS2LAgent

HackRU 2026, Regeneron challenge. Trials come to doctors with the patients already found. Project brief for humans and agents: `.claude/AGENTS.MD`.

## Layout

| Path | What |
|---|---|
| `site/` | Next.js (Pages Router) + Tailwind + Supabase. The main app and backend (API routes). |
| `supabase/migrations/` | Database schema, numbered SQL files. |
| `voice-agent/` | Call Me Maybe: the outbound voice agent (FastAPI + Next.js dashboard). Self-contained, to be migrated into `site/`. See `voice-agent/README.md`. |
| `.claude/context/` | Research notes: trial data, sample patient data, Regeneron context. |

## Run the site

```bash
cd site
cp .env.example .env         # fill in Supabase URL + keys
npm install
npm run dev                  # http://localhost:3000, health check at /api/health
```

Checks: `npm run typecheck` and `npm run lint` from `site/`.

## License

Code: MIT (`LICENSE`). Third-party datasets keep their own licenses and are not committed.
