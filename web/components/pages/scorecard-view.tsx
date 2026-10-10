"use client"

import { CheckCircle2, ChevronDown, Loader2, PlayCircle, XCircle } from "lucide-react"
import { m } from "motion/react"
import dynamic from "next/dynamic"
import { useState } from "react"
import { toast } from "sonner"

import { AnimatedNumber } from "@/components/animated-number"
import { useSelectedLead } from "@/components/dashboard/dashboard"
import { container, item } from "@/components/dashboard/motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePoll } from "@/hooks/use-dashboard-data"
import { post } from "@/lib/api"
import { formatTime } from "@/lib/format"
import type { Persona, ScorecardResult, ScorecardRun } from "@/lib/types"
import { cn } from "@/lib/utils"

const LeadSheet = dynamic(() => import("@/components/dashboard/lead-sheet"), { ssr: false })

const runInterval = (last: ScorecardRun | null) => (last?.status === "running" ? 3000 : 15000)

function ResultRow({ r, onOpen }: { r: ScorecardResult; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(!r.passed)
  const passed = r.checks.filter((c) => c.pass).length
  return (
    <m.li variants={item} className="rounded-xl border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={open}>
        {r.passed ? <CheckCircle2 className="size-5 shrink-0 text-good" aria-label="Passed" /> : <XCircle className="size-5 shrink-0 text-critical" aria-label="Failed" />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{r.label}</span>
          <span className="block truncate text-sm text-muted-foreground">{r.brief}</span>
        </span>
        <span className="hidden font-mono text-xs text-muted-foreground tabular sm:inline">
          {passed}/{r.checks.length} checks
        </span>
        {r.status && (
          <Badge variant="outline" className="hidden rounded-full font-normal md:inline-flex">
            {r.status.replace(/_/g, " ")}
          </Badge>
        )}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-4 py-3">
          {r.checks.map((c, i) => (
            <p key={i} className="flex items-start gap-2 text-sm">
              {c.pass ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-critical" />}
              <span>
                {c.check.replace(/\/(.*)\//, "“$1”")}
                {c.detail && <span className="text-muted-foreground"> · {c.detail}</span>}
              </span>
            </p>
          ))}
          {r.lead_id && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => onOpen(r.lead_id!)}>
              Open the conversation
            </Button>
          )}
        </div>
      )}
    </m.li>
  )
}

export function ScorecardView() {
  const run = usePoll<ScorecardRun | null>("/scorecard/latest", runInterval)
  const personas = usePoll<Persona[]>("/simulate/personas", 600000).data
  const [starting, setStarting] = useState(false)
  const [leadId, selectLead] = useSelectedLead()
  const data = run.data
  const results = data?.results ?? []
  const passed = results.filter((r) => r.passed).length
  const total = personas?.length ?? results.length
  const running = data?.status === "running" || starting

  const start = async () => {
    setStarting(true)
    try {
      await post("/scorecard/run")
      toast.success("Scorecard started", { description: "Ava is talking to each persona in text mode. This takes a few minutes." })
      await run.reload()
    } catch (e) {
      toast.error("Couldn't start the scorecard", { description: (e as Error).message })
    }
    setStarting(false)
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Every persona from the brief, run against the live agent</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Safety scorecard</h1>
        </div>
        <Button onClick={start} disabled={running} className="gap-2 bg-brand hover:bg-brand-strong">
          {running ? <Loader2 className="animate-spin" aria-hidden /> : <PlayCircle aria-hidden />}
          {running ? "Running…" : "Run scorecard"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit gap-4 p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <span className="text-sm font-medium text-muted-foreground">{data ? "Latest run" : "No runs yet"}</span>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-5xl font-semibold tracking-tight", results.length && passed === results.length ? "text-good" : "")}>
              <AnimatedNumber value={passed} />
            </span>
            <span className="text-2xl text-muted-foreground">/ {total || "—"}</span>
          </div>
          <p className="text-sm text-muted-foreground">personas passed every check</p>
          {data && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <m.div
                className="h-full rounded-full bg-good"
                initial={false}
                animate={{ width: `${total ? (passed / total) * 100 : 0}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
          )}
          {data && (
            <p className="text-xs text-muted-foreground">
              {data.status === "running" ? `Running · ${results.length} of ${total} done` : `Finished ${formatTime(data.finished_at)}`}
            </p>
          )}
          <CardDescription className="border-t pt-4 text-xs leading-relaxed">
            Checks are deterministic: the outcome Ava reached, the tools she called, and phrases she must or must never say (for example,
            never &ldquo;you qualify&rdquo;, always &ldquo;911&rdquo; for chest pain).
          </CardDescription>
        </Card>

        <div className="min-w-0">
          {!run.lastUpdated ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : results.length ? (
            <m.ul variants={container} initial="hidden" animate="show" className="space-y-3">
              {results.map((r) => (
                <ResultRow key={r.persona} r={r} onOpen={selectLead} />
              ))}
              {running &&
                (personas ?? [])
                  .filter((p) => !results.some((r) => r.persona === p.id))
                  .map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 text-sm text-muted-foreground">
                      {i === 0 ? <Loader2 className="size-5 animate-spin" /> : <span className="size-5 rounded-full border-2 border-dashed" />}
                      {p.label}
                      {i === 0 && <span className="ml-auto text-xs">in progress</span>}
                    </li>
                  ))}
            </m.ul>
          ) : (
            <Card className="items-center gap-2 py-14 text-center">
              <CardHeader className="w-full">
                <CardTitle>No scorecard yet</CardTitle>
                <CardDescription>Run it to see how Ava handles every persona from the brief.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
      {leadId != null && <LeadSheet key={leadId} leadId={leadId} onClose={() => selectLead(null)} />}
    </>
  )
}
