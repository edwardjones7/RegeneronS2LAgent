# Migrations

Schema changes for the Supabase Postgres database used by `site/`.

- One numbered SQL file per change. Files run in name order, so `00001_` and `00002_` (trials) run before `0001_` (practices and patients). Give a new file the next five-digit number.
- Never edit a migration once it is committed. Add a new one.
- Patient rows live only in `patients`, each scoped to one practice (see `.claude/AGENTS.MD` §5). Nothing that leaves a practice may carry a patient identifier; sponsor-facing reads use de-identified counts.
