// The dashboard is served by the FastAPI backend on the same origin, so requests carry
// the session cookie automatically. A 401 means the session ended: go back to sign-in.

export class AuthError extends Error {}

export async function api<T>(path: string, signal?: AbortSignal, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal,
  })
  if (res.status === 401) {
    // Full navigation on purpose: sign-in is served (and the cookie set) by the backend, not this app.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/dashboard/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
    throw new AuthError("signed out")
  }
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const j = await res.json()
      detail = typeof j.detail === "string" ? j.detail : detail
    } catch {}
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

/** POST JSON to the backend (coordinator actions). */
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, undefined, { method: "POST", body })
