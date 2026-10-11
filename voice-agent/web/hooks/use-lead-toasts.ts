"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { displayName } from "@/lib/format"
import type { LeadSummary } from "@/lib/types"

/** Toast when something happens between polls: new opt-in, booking, escalation, emergency. */
export function useLeadToasts(leads: LeadSummary[] | null, onOpen: (id: number) => void) {
  const prev = useRef<Map<number, string> | null>(null)
  useEffect(() => {
    if (!leads) return
    const next = new Map(leads.map((l) => [l.id, l.status]))
    const before = prev.current
    prev.current = next
    if (!before) return // first load: no toasts
    for (const l of leads) {
      const was = before.get(l.id)
      if (was === l.status) continue
      const name = displayName(l)
      const action = { label: "Open", onClick: () => onOpen(l.id) }
      if (!was) toast(`New opt-in: ${name}`, { description: "Ava is calling now.", action })
      else if (l.status === "booked") toast.success(`Visit booked: ${name}`, { description: l.status_reason.replace("visit ", ""), action })
      else if (l.status === "emergency") toast.error(`Possible emergency: ${name}`, { description: "Ava told them to call 911.", action, duration: 15000 })
      else if (l.status === "needs_human") toast.warning(`${name} needs a person`, { description: l.status_reason, action })
      else if (l.status === "not_a_fit") toast(`${name}: not a fit`, { description: l.status_reason })
    }
  }, [leads, onOpen])
}
