"use client"

import { CalendarCheck, Hand, PhoneIncoming, Users, Zap } from "lucide-react"
import { m } from "motion/react"

import { AnimatedNumber } from "@/components/animated-number"
import { Card } from "@/components/ui/card"
import { useNow } from "@/hooks/use-url"
import { formatSeconds, parseTime } from "@/lib/format"
import type { LeadSummary, Overview } from "@/lib/types"
import { cn } from "@/lib/utils"

import { item } from "./motion"

type Kpi = {
  label: string
  value: number | null
  format?: (n: number) => string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  hero?: boolean
  alert?: boolean
}

export function KpiCards({ overview, leads }: { overview: Overview; leads: LeadSummary[] }) {
  const now = useNow(30000)
  const total = overview.total_leads
  const booked = overview.by_status.booked ?? 0
  const attention = overview.needs_attention
  const todayStr = new Date(now).toDateString()
  const today = leads.filter((l) => parseTime(l.created_at)?.toDateString() === todayStr).length
  const oldest = attention.map((l) => parseTime(l.created_at)!.getTime()).sort((a, b) => a - b)[0]
  const waitingMin = oldest ? Math.max(0, Math.round((now - oldest) / 60000)) : null

  const kpis: Kpi[] = [
    overview.median_seconds_to_ring != null
      ? {
          label: "Speed to lead",
          value: overview.median_seconds_to_ring,
          format: (n) => `${n.toFixed(1)}s`,
          hint: "Median time from opt-in to the phone ringing",
          icon: Zap,
          hero: true,
        }
      : {
          label: "Speed to lead",
          value: overview.median_seconds_to_first_call,
          format: (n) => formatSeconds(n),
          hint: "Median time from opt-in to call placed",
          icon: Zap,
          hero: true,
        },
    { label: "Leads", value: total, hint: today ? `${today} new today` : "No new leads today", icon: Users },
    {
      label: "Reached",
      value: total ? (overview.reached / total) * 100 : null,
      format: (n) => `${Math.round(n)}%`,
      hint: `${overview.reached} of ${total} picked up`,
      icon: PhoneIncoming,
    },
    {
      label: "Visits booked",
      value: booked,
      hint: overview.reached ? `${Math.round((booked / overview.reached) * 100)}% of people reached` : "None yet",
      icon: CalendarCheck,
    },
    {
      label: "Needs a human",
      value: attention.length,
      hint: waitingMin != null ? `Oldest waiting ${waitingMin < 60 ? `${waitingMin}m` : `${Math.round(waitingMin / 60)}h`}` : "All clear",
      icon: Hand,
      alert: attention.length > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {kpis.map((k) => (
        <m.div key={k.label} variants={item} className={cn(k.hero && "col-span-2 lg:col-span-1")}>
          <Card
            className={cn(
              "relative h-full gap-0 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_4px_16px_-4px_rgba(16,24,40,0.08)]",
              k.hero && "bg-linear-to-br from-brand to-brand-strong text-white ring-0"
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn("text-sm font-medium", k.hero ? "text-white/80" : "text-muted-foreground")}>{k.label}</span>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-lg",
                  k.hero ? "bg-white/15 text-white" : k.alert ? "bg-warning-soft text-warning" : "bg-muted text-foreground/70"
                )}
              >
                <k.icon className="size-4" aria-hidden />
              </span>
            </div>
            <div className={cn("mt-3 text-3xl font-semibold tracking-tight", k.alert && "text-warning")}>
              {k.value == null ? "—" : <AnimatedNumber value={k.value} format={k.format} />}
            </div>
            <p className={cn("mt-1 text-xs", k.hero ? "text-white/75" : "text-muted-foreground")}>{k.hint}</p>
          </Card>
        </m.div>
      ))}
    </div>
  )
}
