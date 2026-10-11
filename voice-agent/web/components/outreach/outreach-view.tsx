"use client"

import { ArrowRight, CalendarCheck, ClipboardList, Hand, MessageSquareText, PhoneIncoming, PhoneOutgoing, Search, ShieldCheck } from "lucide-react"
import { AnimatePresence, m } from "motion/react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useMemo, useState } from "react"

import { AnimatedNumber } from "@/components/animated-number"
import { usePractice } from "@/components/app-shell"
import { useSelectedLead } from "@/components/dashboard/dashboard"
import { LiveCallCard } from "@/components/dashboard/live-call-card"
import { container, item } from "@/components/dashboard/motion"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePoll } from "@/hooks/use-dashboard-data"
import { useNow } from "@/hooks/use-url"
import { displayName, formatTime, initials, timeAgo } from "@/lib/format"
import type { LeadStatus, LiveCall, OutreachOverview, OutreachRow, TrialCard } from "@/lib/types"
import { cn } from "@/lib/utils"

import { SequenceDots } from "./sequence-dots"
import { StaffQueue } from "./staff-queue"

const LeadSheet = dynamic(() => import("@/components/dashboard/lead-sheet"), { ssr: false })

// Where everyone is. Colors are the dashboard's validated palette; every segment is also labeled.
const STAGES: { id: string; label: string; color: string; statuses: LeadStatus[] }[] = [
  { id: "booked", label: "Booked", color: "#059669", statuses: ["booked"] },
  { id: "trying", label: "Calling / trying again", color: "#3b82f6", statuses: ["calling", "queued", "no_answer"] },
  { id: "staff", label: "Needs a person", color: "#f59e0b", statuses: ["needs_human", "emergency"] },
  { id: "review", label: "Chart review", color: "#fcd34d", statuses: ["chart_review"] },
  { id: "follow", label: "Office follow-up", color: "#a1a1aa", statuses: ["not_a_fit"] },
  { id: "closed", label: "Not interested / opted out", color: "#d4d4d8", statuses: ["closed", "opted_out", "dropped"] },
]

const FILTERS = [
  { id: "all", label: "All" },
  { id: "booked", label: "Booked" },
  { id: "trying", label: "In progress" },
  { id: "staff", label: "Needs staff" },
  { id: "closed", label: "Closed" },
]

const ACTIVITY: Record<string, string> = {
  call_started: "Call placed",
  call_ended: "Call ended",
  sms_sent: "Text sent",
  sms_received: "Texted back",
  slots_offered: "Times offered by text",
  visit_booked: "Visit booked",
  visit_confirmed: "Visit confirmed",
  visit_rescheduled: "Visit rescheduled",
  retry_scheduled: "Retry scheduled",
  identity_verified: "Identity confirmed",
  inbound_call: "Called back",
  call_window_set: "Asked for a later time",
  status: "Updated",
  lead_received: "Added from pre-screen",
  chart_review_cleared: "Chart cleared",
  answer: "Answered a question",
  screening_complete: "Questions done",
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  pct,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "good" | "warning"
  pct?: boolean
}) {
  return (
    <m.div variants={item}>
      <Card className={cn("h-full gap-2 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", tone === "good" && "ring-1 ring-good/25")}>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {label}
          <Icon className={cn("size-4", tone === "good" ? "text-good" : tone === "warning" && value ? "text-warning" : "")} />
        </div>
        <div className={cn("text-3xl font-semibold tracking-tight tabular", tone === "good" && "text-good")}>
          <AnimatedNumber value={value} format={pct ? (n) => `${Math.round(n)}%` : undefined} />
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </Card>
    </m.div>
  )
}

function StageBar({ rows }: { rows: OutreachRow[] }) {
  const total = rows.length || 1
  const parts = STAGES.map((s) => ({ ...s, n: rows.filter((r) => s.statuses.includes(r.status)).length }))
  return (
    <Card className="gap-4 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Where everyone is</h2>
        <span className="text-xs text-muted-foreground">Call, then voicemail and text, then try tomorrow. Three tries, then a person.</span>
      </div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Outreach by stage">
        {parts.map(
          (p) =>
            p.n > 0 && (
              <m.span
                key={p.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ backgroundColor: p.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(p.n / total) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            )
        )}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} aria-hidden />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular">{p.n}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function PatientsTable({ rows, selectedId, onSelect }: { rows: OutreachRow[]; selectedId: number | null; onSelect: (id: number) => void }) {
  useNow(15000)
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const groups = useMemo(
    () => ({
      booked: (r: OutreachRow) => r.status === "booked",
      trying: (r: OutreachRow) => ["calling", "queued", "no_answer"].includes(r.status),
      staff: (r: OutreachRow) => ["needs_human", "emergency", "chart_review"].includes(r.status),
      closed: (r: OutreachRow) => ["closed", "opted_out", "dropped", "not_a_fit"].includes(r.status),
    }),
    []
  )
  const visible = rows
    .filter((r) => filter === "all" || groups[filter as keyof typeof groups](r))
    .filter((r) => !query.trim() || displayName(r).toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.last_activity?.at ?? "").localeCompare(a.last_activity?.at ?? ""))

  return (
    <Card className="gap-0 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Patients</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="h-8">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.id} value={f.id} className="gap-1.5 px-2.5 text-xs">
                  {f.label}
                  <span className="text-muted-foreground tabular">
                    {f.id === "all" ? rows.length : rows.filter(groups[f.id as keyof typeof groups]).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patients" aria-label="Search patients" className="h-8 w-full pl-8 text-sm sm:w-48" />
          </div>
        </div>
      </CardHeader>
      <div className="max-h-[640px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="pl-4">Patient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tries</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead className="hidden lg:table-cell">Last activity</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, 200).map((r) => (
              <TableRow
                key={r.id}
                onClick={() => onSelect(r.id)}
                data-state={selectedId === r.id ? "selected" : undefined}
                className="cursor-pointer"
              >
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[11px]">{initials(r)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{displayName(r)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.simulated ? "Simulated patient" : "Real phone"}
                        {r.call_window ? ` · prefers ${r.call_window.replace("after ", "after ")}` : ""}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge lead={r} />
                </TableCell>
                <TableCell>
                  <SequenceDots row={r} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="inline-flex items-center gap-3 text-xs text-muted-foreground tabular">
                    <span className="inline-flex items-center gap-1" title="Texts sent">
                      <MessageSquareText className="size-3.5" aria-hidden /> {r.texts}
                    </span>
                    {r.inbound_calls > 0 && (
                      <span className="inline-flex items-center gap-1 text-brand" title="Called back">
                        <PhoneIncoming className="size-3.5" aria-hidden /> {r.inbound_calls}
                      </span>
                    )}
                    {r.identity_verified && (
                      <span className="inline-flex items-center gap-1 text-good" title="Identity confirmed">
                        <ShieldCheck className="size-3.5" aria-hidden />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {r.last_activity ? (
                    <>
                      {ACTIVITY[r.last_activity.type] ?? r.last_activity.type.replaceAll("_", " ")}{" "}
                      <span className="text-xs">· {timeAgo(r.last_activity.at)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                  {r.next_attempt_at && r.status !== "calling" && (
                    <div className="text-xs">Next try {formatTime(r.next_attempt_at)}</div>
                  )}
                </TableCell>
                <TableCell>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No patients here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

function NoTrialsYet() {
  return (
    <Card className="items-center gap-3 p-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <PhoneOutgoing className="size-5" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">No outreach yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        When the doctor accepts a trial, Ava starts calling that trial&apos;s pre-screened patients from this office. Nothing else to set up.
      </p>
      <Button asChild className="mt-2">
        <Link href="/trials">
          See trials this practice can fill <ArrowRight aria-hidden />
        </Link>
      </Button>
    </Card>
  )
}

export function OutreachView() {
  const { practiceId, practices } = usePractice()
  const pid = practiceId ? encodeURIComponent(practiceId) : null
  const trials = usePoll<TrialCard[]>(pid && `/practices/${pid}/trials`, 20000).data
  const accepted = (trials ?? []).filter((t) => t.accepted)
  const [trial, setTrial] = useState("all")
  const nct = accepted.some((t) => t.nct_id === trial) ? trial : "all"
  const overview = usePoll<OutreachOverview>(pid && `/practices/${pid}/outreach${nct !== "all" ? `?nct_id=${nct}` : ""}`, 3000)
  const live = usePoll<LiveCall[]>(pid && `/calls/live?practice_id=${pid}`, (last) => (last?.length ? 1500 : 3000)).data ?? []
  const [leadId, selectLead] = useSelectedLead()
  const o = overview.data
  const practiceName = practices?.find((p) => p.id === practiceId)?.name

  if (!o || !trials) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  const t = o.totals
  return (
    <>
      <m.div key={`${practiceId}-${nct}`} variants={container} initial="hidden" animate="show" className="space-y-6">
        <m.div variants={item} className="mb-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {o.practice.office_display} · {practiceName}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Patient outreach</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Ava calls the doctor&apos;s own pre-screened patients from this office, confirms who she&apos;s talking to, and books a screening visit. Patients stay with this practice.
            </p>
          </div>
          {accepted.length > 0 && (
            <Tabs value={nct} onValueChange={setTrial}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="px-3 text-xs">
                  All trials
                </TabsTrigger>
                {accepted.map((a) => (
                  <TabsTrigger key={a.nct_id} value={a.nct_id} className="px-3 text-xs">
                    {a.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </m.div>

        {accepted.length === 0 ? (
          <m.div variants={item}>
            <NoTrialsYet />
          </m.div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {live.map((call) => (
                <LiveCallCard key={call.call_id} call={call} onOpen={selectLead} />
              ))}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Kpi label="Patients" value={t.patients} hint={`${t.called} called so far`} icon={PhoneOutgoing} />
              <Kpi
                label="Reached"
                value={t.called ? (t.reached / t.called) * 100 : 0}
                pct
                hint={`${t.reached} picked up · ${t.texted} texted`}
                icon={PhoneIncoming}
              />
              <Kpi label="Booked" value={t.booked} hint="Screening visits on the calendar" icon={CalendarCheck} tone="good" />
              <Kpi label="Needs a person" value={t.needs_staff} hint="Handed to office staff" icon={Hand} tone="warning" />
              <Kpi label="Chart review" value={t.chart_review} hint="Not called until a person checks" icon={ClipboardList} tone="warning" />
            </div>

            <m.div variants={item}>
              <StageBar rows={o.patients} />
            </m.div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <m.div variants={item} className="min-w-0">
                <PatientsTable rows={o.patients} selectedId={leadId} onSelect={selectLead} />
              </m.div>
              <m.div variants={item}>
                <StaffQueue rows={o.patients} onSelect={selectLead} onChanged={overview.reload} />
              </m.div>
            </div>

            <m.p variants={item} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="rounded-full font-normal">
                Demo
              </Badge>
              Synthetic patients (Synthea). Patients without a real phone number are simulated: their calls and texts never leave the
              server. Study wording is not IRB-approved.
            </m.p>
          </>
        )}
      </m.div>
      {leadId != null && <LeadSheet key={leadId} leadId={leadId} onClose={() => selectLead(null)} />}
    </>
  )
}
