import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/utils/envManager';

/**
 * Server-only Supabase client using the SECRET key (formerly service_role). It bypasses RLS, so
 * every API route must enforce authorization in code before calling it.
 *
 * Never import this from a component or any browser code.
 *
 * Privacy rule (.claude/AGENTS.MD §5): the `patients` table stands in for each
 * practice's own EHR. Only read patients scoped to one practice
 * (`.eq('practice_id', ...)`), never across practices. Anything that leaves a
 * practice, such as a sponsor view, uses de-identified counts only
 * (`practice_patient_counts()`, small counts suppressed).
 *
 * Created on first use, not at import, so `next build` works without the env set.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  client ??= createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SECRET_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client;
}

/** The same client, created on first property access. */
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getSupabase();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export default supabase;
