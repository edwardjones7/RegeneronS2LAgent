import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client for auth (sign-in, session refresh).
 * Uses the anon key; sessions persist in localStorage.
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Returns a fresh access token (refreshing the session if needed), or null when signed out. */
export async function getAuthToken(): Promise<string | null> {
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.access_token ?? null;
}
