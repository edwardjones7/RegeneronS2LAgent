// The dashboard is served by the FastAPI backend on the same origin, so requests carry
// the session cookie automatically. A 401 means the session ended: go back to sign-in.

export class AuthError extends Error {}

export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  })
  if (res.status === 401) {
    // Full navigation on purpose: sign-in is served (and the cookie set) by the backend, not this app.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/dashboard/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
    throw new AuthError("signed out")
  }
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}
