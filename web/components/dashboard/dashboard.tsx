"use client"

import { ExternalLink, LogOut, Phone } from "lucide-react"
import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react"
import dynamic from "next/dynamic"
import { useCallback } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useDashboardData } from "@/hooks/use-dashboard-data"
import { navigate, useNow, useSearch } from "@/hooks/use-url"
import { cn } from "@/lib/utils"

import { AttentionCard } from "./attention-card"
import { KpiCards } from "./kpi-cards"
import { LeadsTable } from "./leads-table"
import { container, item } from "./motion"
import { OutcomeBar } from "./outcome-bar"

// The detail sheet isn't needed for first paint: load it on demand.
const LeadSheet = dynamic(() => import("./lead-sheet"), { ssr: false })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function useSelectedLead() {
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className={cn("gap-3 p-5", i === 0 && "col-span-2 lg:col-span-1")}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-2.5 w-full rounded-full" />
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="h-80 p-5">
          <Skeleton className="h-4 w-24" />
        </Card>
        <Card className="h-80 p-5">
          <Skeleton className="h-4 w-40" />
        </Card>
      </div>
    </div>
  )
}

export function Dashboard() {
  const { overview, leads, lastUpdated, error } = useDashboardData()
  const [leadId, selectLead] = useSelectedLead()
  const ready = overview && leads
  const c = overview?.campaign

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <TooltipProvider delayDuration={150}>
          <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
              <span className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-[oklch(0.55_0.2_262)] to-[oklch(0.45_0.18_270)] text-white shadow-sm">
                <Phone className="size-4" aria-hidden />
              </span>
              <span className="font-semibold tracking-tight">Call Me Maybe</span>
              <span className="hidden text-sm text-muted-foreground sm:inline">/ Coordinator</span>
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <LiveIndicator lastUpdated={lastUpdated} error={error} />
                <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                  <a href="/demo" target="_blank" rel="noopener">
                    Opt-in form <ExternalLink aria-hidden />
                  </a>
                </Button>
                <form method="post" action="/dashboard/logout">
                  <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                    <LogOut aria-hidden />
                    <span className="hidden sm:inline">Sign out</span>
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
            {!ready ? (
              <>
                <div className="mb-8 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-8 w-72" />
                </div>
                <LoadingState />
              </>
            ) : (
              <m.div variants={container} initial="hidden" animate="show" className="space-y-6">
                <m.div variants={item} className="mb-8 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{cap(c!.team_name)}</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{cap(c!.study_short_name)} study</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                      <a
                        href={c!.study_url}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 font-mono text-xs text-foreground/80 underline-offset-4 hover:underline"
                      >
                        {c!.nct_id} <ExternalLink className="size-3" aria-hidden />
                      </a>
                      <span aria-hidden>·</span>
                      <span>
                        Calling hours {c!.calling_hours.start}–{c!.calling_hours.end} {c!.timezone.split("/").pop()?.replace("_", " ")}
                      </span>
                      <span aria-hidden>·</span>
                      <span>Coordinator {c!.coordinator_name}</span>
                    </div>
                  </div>
                  {c!.demo_not_irb_approved && (
                    <Badge variant="outline" className="h-7 rounded-full px-3 font-normal text-muted-foreground">
                      Demo · study wording not IRB-approved
                    </Badge>
                  )}
                </m.div>

                <KpiCards overview={overview} leads={leads} />

                <m.div variants={item}>
                  <OutcomeBar overview={overview} />
                </m.div>

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
          </main>

          {leadId != null && <LeadSheet key={leadId} leadId={leadId} onClose={() => selectLead(null)} />}
        </TooltipProvider>
      </LazyMotion>
    </MotionConfig>
  )
}
