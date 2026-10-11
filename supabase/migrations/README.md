# Migrations

Schema changes for the Supabase Postgres database used by `site/`.

- One numbered SQL file per change. Files run in name order, so `00001_` and `00002_` (trials) run before `0001_` (practices and patients), then `0002_` (trial criteria) and `0003_` (pre-screen results). A new file that references `patients` or `practices` must sort after `0001_`, so continue the four-digit series (`0004_`, …); a five-digit name would sort before `0001_` and fail on a fresh database.
- Never edit a migration once it is committed. Add a new one.
- Patient rows live only in `patients`, each scoped to one practice (see `.claude/AGENTS.MD` §5). Nothing that leaves a practice may carry a patient identifier; sponsor-facing reads use de-identified counts.
