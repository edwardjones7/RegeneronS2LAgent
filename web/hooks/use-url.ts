"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}

/** Current query string, kept in sync with history navigation (empty during prerender). */
export function useSearch() {
  return useSyncExternalStore(subscribe, () => window.location.search, () => "")
}

/** Push a new URL and notify useSearch subscribers. */
export function navigate(url: string) {
  window.history.pushState(null, "", url)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

/** A clock that ticks every `ms`, for relative times without calling Date.now() in render. */
export function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
