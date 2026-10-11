"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { AuthError, api } from "@/lib/api"
import type { LeadSummary, LiveCall, Overview } from "@/lib/types"

const POLL_MS = 4000

/** Polls a URL while the tab is visible; returns the latest value. */
function usePoll<T>(url: string | null, intervalMs: number | ((last: T | null) => number)) {
  const [data, setData] = useState<T | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const lastRef = useRef<T | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!url) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    try {
      const d = await api<T>(url, c.signal)
      lastRef.current = d
      setData(d)
      setLastUpdated(Date.now())
      setError(false)
    } catch (e) {
      if (!(e instanceof AuthError) && (e as Error).name !== "AbortError") setError(true)
    }
  }, [url])

  useEffect(() => {
    if (!url) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const tick = async () => {
      if (!document.hidden) await load()
      if (stopped) return
      const ms = typeof intervalMs === "function" ? intervalMs(lastRef.current) : intervalMs
      timer = setTimeout(tick, ms)
    }
    timer = setTimeout(tick, 0)
    const onVisible = () => !document.hidden && load()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      ctrl.current?.abort()
    }
  }, [url, intervalMs, load])

  return { data, lastUpdated, error, reload: load }
}

export function useDashboardData(campaignId: string | null) {
  const id = campaignId ? encodeURIComponent(campaignId) : null
  const overview = usePoll<Overview>(id && `/campaigns/${id}`, POLL_MS)
  const leads = usePoll<LeadSummary[]>(id && `/campaigns/${id}/leads`, POLL_MS)
  return {
    overview: overview.data,
    leads: leads.data,
    lastUpdated: overview.lastUpdated,
    error: overview.error || leads.error,
    reload: () => {
      overview.reload()
      leads.reload()
    },
  }
}

const liveInterval = (last: LiveCall[] | null) => (last && last.length ? 1500 : 3000)

/** Active calls: polls fast while a call is live so the transcript streams in. */
export function useLiveCalls(campaignId: string | null) {
  const id = campaignId ? encodeURIComponent(campaignId) : null
  return usePoll<LiveCall[]>(id && `/calls/live?campaign_id=${id}`, liveInterval).data ?? []
}

export { usePoll }
