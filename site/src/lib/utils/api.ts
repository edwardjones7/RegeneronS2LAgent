/**
 * Client-side fetch for this app's JSON API routes ({ success, data?, error }).
 * Resolves with `json.data`; throws `Error(json.error)` on a non-OK status or
 * an explicit `success: false`. The browser never talks to Supabase directly.
 */
export async function fetchJson<T>(
  url: string,
  opts: { fallbackError?: string } = {}
): Promise<T> {
  const res = await fetch(url);
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
