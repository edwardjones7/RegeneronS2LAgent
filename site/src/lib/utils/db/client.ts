import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/utils/envManager';

/**
 * Server-only Supabase client using the SERVICE ROLE key. It bypasses RLS, so
 * every API route must enforce authorization in code before calling it.
 *
 * Never import this from a component or any browser code.
 *
 * Privacy rule (.claude/AGENTS.MD §5): identifiable patient data never goes
 * into Supabase. Store trials, protocols, practices, doctors and
 * de-identified aggregate counts only.
 */
const supabase = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default supabase;
