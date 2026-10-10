"use client"

import { ExternalLink } from "lucide-react"
import { AnimatePresence, m } from "motion/react"
import dynamic from "next/dynamic"
import { useCallback } from "react"

import { AppShell, useCampaign } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboardData, useLiveCalls } from "@/hooks/use-dashboard-data"
import { useLeadToasts } from "@/hooks/use-lead-toasts"
import { navigate, useNow, useSearch } from "@/hooks/use-url"
import { cn } from "@/lib/utils"

import { AttentionCard } from "./attention-card"
import { FunnelCard } from "./funnel-card"
import { KpiCards } from "./kpi-cards"
import { LeadsTable } from "./leads-table"
import { LiveCallCard } from "./live-call-card"
import { container, item } from "./motion"
import { OutcomeBar } from "./outcome-bar"

// The detail sheet isn't needed for first paint: load it on demand.
const LeadSheet = dynamic(() => import("./lead-sheet"), { ssr: false })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function useSelectedLead() {
  const v = new URLSearchParams(useSearch()).get("lead")
  const leadId = v && /^\d+$/.test(v) ? Number(v) : null
  const select = useCallback((id: number | null) => {
    navigate(id == null ? window.location.pathname : `${window.location.pathname}?lead=${id}`)
  }, [])
  return [leadId, select] as const
}

function LiveIndicator({ lastUpdated, error }: { lastUpdated: number | null; error: boolean }) {
  const now = useNow()
  const stale = error || (lastUpdated != null && now - lastUpdated > 15000)
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium", stale ? "text-warning" : "text-good")}>
      <span className="relative flex size-2">
        {!stale && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-40 motion-reduce:hidden" />}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {stale ? "Reconnecting" : "Live"}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className={cn("gap-3 p-5", i === 0 && "col-span-2 lg:col-span-1")}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-56 p-5">
          <Skeleton className="h-4 w-48" />
        </Card>
        <Card className="h-56 p-5">
          <Skeleton className="h-4 w-48" />
        </Card>
      </div>
      <Card className="h-80 p-5">
        <Skeleton className="h-4 w-24" />
      </Card>
    </div>
  )
}

function Overview() {
  const { campaignId } = useCampaign()
  const { overview, leads, lastUpdated, error } = useDashboardData(campaignId)
  const live = useLiveCalls(campaignId)
  const [leadId, selectLead] = useSelectedLead()
  useLeadToasts(leads, selectLead)
  const c = overview?.campaign

  return (
    <>
      {!overview || !leads || !c ? (
        <LoadingState />
      ) : (
        <m.div key={c.id} variants={container} initial="hidden" animate="show" className="space-y-6">
          <m.div variants={item} className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{cap(c.team_name)}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{cap(c.study_short_name)} study</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                <LiveIndicator lastUpdated={lastUpdated} error={error} />
                <span aria-hidden>·</span>
                <a
                  href={c.study_url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 font-mono text-xs text-foreground/80 underline-offset-4 hover:underline"
                >
                  {c.nct_id} <ExternalLink className="size-3" aria-hidden />
                </a>
                <span aria-hidden>·</span>
                <span>
                  Calling hours {c.calling_hours.start}–{c.calling_hours.end} {c.timezone.split("/").pop()?.replace("_", " ")}
                </span>
                <span aria-hidden>·</span>
                <span>Coordinator {c.coordinator_name}</span>
              </div>
            </div>
            {c.demo_not_irb_approved && (
              <Badge variant="outline" className="h-7 rounded-full px-3 font-normal text-muted-foreground">
                Demo · study wording not IRB-approved
              </Badge>
            )}
          </m.div>

          <AnimatePresence initial={false}>
            {live.map((call) => (
              <LiveCallCard key={call.call_id} call={call} onOpen={selectLead} />
            ))}
          </AnimatePresence>

          <KpiCards overview={overview} leads={leads} />

          <div className="grid gap-6 lg:grid-cols-2">
            <m.div variants={item}>
              <FunnelCard funnel={overview.funnel} />
            </m.div>
            <m.div variants={item}>
              <OutcomeBar overview={overview} />
            </m.div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <m.div variants={item} className="min-w-0">
              <LeadsTable leads={leads} selectedId={leadId} onSelect={selectLead} />
            </m.div>
            <m.div variants={item}>
              <AttentionCard items={overview.needs_attention} onSelect={selectLead} />
            </m.div>
          </div>
        </m.div>
      )}
      {leadId != null && <LeadSheet key={leadId} leadId={leadId} onClose={() => selectLead(null)} />}
    </>
  )
}

export function Dashboard() {
  return (
    <AppShell>
      <Overview />
    </AppShell>
  )
}
