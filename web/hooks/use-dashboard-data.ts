"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { AuthError, api } from "@/lib/api"
import type { Campaign, LeadSummary, Overview } from "@/lib/types"

const POLL_MS = 4000

/** Polls the campaign overview + lead list. Pauses while the tab is hidden. */
export function useDashboardData() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [leads, setLeads] = useState<LeadSummary[] | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    api<Campaign[]>("/campaigns")
      .then((list) => {
        setCampaigns(list)
        setCampaignId(list[0]?.id ?? null)
      })
      .catch((e) => !(e instanceof AuthError) && setError(true))
  }, [])

  const refresh = useCallback(async () => {
    if (!campaignId) return
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    try {
      const id = encodeURIComponent(campaignId)
      const [o, l] = await Promise.all([
        api<Overview>(`/campaigns/${id}`, ctrl.signal),
        api<LeadSummary[]>(`/campaigns/${id}/leads`, ctrl.signal),
      ])
      setOverview(o)
      setLeads(l)
      setLastUpdated(Date.now())
      setError(false)
    } catch (e) {
      if (!(e instanceof AuthError) && (e as Error).name !== "AbortError") setError(true)
    }
  }, [campaignId])

  useEffect(() => {
    if (!campaignId) return
    const first = setTimeout(refresh, 0)
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      clearInterval(timer)
      timer = setInterval(refresh, POLL_MS)
    }
    const onVisibility = () => {
      if (document.hidden) clearInterval(timer)
      else {
        refresh()
        start()
      }
    }
    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
      inFlight.current?.abort()
    }
  }, [campaignId, refresh])

  return { campaigns, campaignId, setCampaignId, overview, leads, lastUpdated, error, refresh }
}
