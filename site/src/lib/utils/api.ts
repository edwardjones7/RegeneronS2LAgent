import { getAuthToken } from '@/lib/utils/supabase/browser';

/**
 * Client-side fetch for this app's JSON API routes ({ success, data?, error }).
 * Resolves with `json.data`; throws `Error(json.error)` on a non-OK status or
 * an explicit `success: false`. With `auth: true` it fetches a fresh token per
 * call — never capture a token outside the request (it can expire while a tab
 * sits open and background refetches reuse it).
 */
export async function fetchJson<T>(
  url: string,
  opts: { auth?: boolean; fallbackError?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth) {
    const token = await getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  const json = await res.json();
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || opts.fallbackError || 'Request failed');
  }
  return json.data as T;
}

/** Message for UI display from an unknown thrown value. */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
