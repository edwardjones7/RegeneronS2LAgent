"use client"

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { m } from "motion/react"
import dynamic from "next/dynamic"
import { useState } from "react"

import { useCampaign } from "@/components/app-shell"
import { useSelectedLead } from "@/components/dashboard/dashboard"
import { container, item } from "@/components/dashboard/motion"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePoll } from "@/hooks/use-dashboard-data"
import { displayName, initials } from "@/lib/format"
import type { Visit } from "@/lib/types"
import { cn } from "@/lib/utils"

const LeadSheet = dynamic(() => import("@/components/dashboard/lead-sheet"), { ssr: false })

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday
  return x
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function CalendarView() {
  const { campaignId } = useCampaign()
  const visits = usePoll<Visit[]>(campaignId && `/campaigns/${encodeURIComponent(campaignId)}/visits`, 8000).data
  const [weekOffset, setWeekOffset] = useState(0)
  const [leadId, selectLead] = useSelectedLead()

  // On weekends, "this week" means the coming work week.
  const [baseWeek] = useState(() => {
    const now = new Date()
    const w = startOfWeek(now)
    if (now.getDay() === 0 || now.getDay() === 6) w.setDate(w.getDate() + 7)
    return w
  })
  const monday = new Date(baseWeek)
  monday.setDate(monday.getDate() + weekOffset * 7)
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
  const byDay = new Map<string, Visit[]>()
  for (const v of visits ?? []) {
    const k = dayKey(new Date(v.starts_at_local))
    byDay.set(k, [...(byDay.get(k) ?? []), v])
  }
  const todayKey = dayKey(new Date())
  const upcoming = (visits ?? []).length

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Screening visits booked by Ava</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground tabular">
            {upcoming} visit{upcoming === 1 ? "" : "s"} booked
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            This week
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {!visits ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : (
        <m.div key={weekOffset} variants={container} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-5">
          {days.map((d) => {
            const list = (byDay.get(dayKey(d)) ?? []).sort((a, b) => a.starts_at_local.localeCompare(b.starts_at_local))
            const isToday = dayKey(d) === todayKey
            return (
              <m.div key={dayKey(d)} variants={item}>
                <Card className={cn("min-h-72 gap-3 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", isToday && "ring-brand/40")}>
                  <div className="flex items-baseline justify-between">
                    <span className={cn("text-sm font-medium", isToday && "text-brand")}>{d.toLocaleDateString([], { weekday: "long" })}</span>
                    <span className="font-mono text-xs text-muted-foreground">{d.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                  </div>
                  {list.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground/70">
                      <CalendarDays className="size-4" aria-hidden />
                      No visits
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((v) => (
                        <li key={v.slot_id}>
                          <button
                            onClick={() => selectLead(v.lead_id)}
                            className="flex w-full items-center gap-2.5 rounded-lg border-l-[3px] border-brand bg-brand-soft/60 px-2.5 py-2 text-left transition-colors hover:bg-brand-soft"
                          >
                            <Avatar className="size-7">
                              <AvatarFallback className="bg-background text-[11px]">{initials(v)}</AvatarFallback>
                            </Avatar>
                            <span className="min-w-0">
                              <span className="block font-mono text-xs text-brand">
                                {new Date(v.starts_at_local).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </span>
                              <span className="block truncate text-sm font-medium">{displayName(v)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </m.div>
            )
          })}
        </m.div>
      )}
      {leadId != null && <LeadSheet key={leadId} leadId={leadId} onClose={() => selectLead(null)} />}
    </>
  )
}
