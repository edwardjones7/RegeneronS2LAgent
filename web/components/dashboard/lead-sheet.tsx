"use client"

import { CalendarCheck, CircleAlert, Phone, Siren, Wrench } from "lucide-react"
import { useEffect, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AuthError, api } from "@/lib/api"
import {
  STATUS,
  displayName,
  formatDuration,
  formatPhone,
  formatSeconds,
  formatTime,
  formatVisit,
  initials,
  sourceLabel,
} from "@/lib/format"
import type { CallRecord, LeadDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

import { StatusBadge } from "./status-badge"

const SCREENING_STATE = {
  in_progress: "In progress",
  fit: "Looks like a fit",
  not_a_fit: "Not a fit",
  needs_review: "Needs review",
} as const

const VERDICT = {
  fit: { label: "OK", cls: "bg-good-soft text-good" },
  disqualify: { label: "No", cls: "bg-critical-soft text-critical" },
  unsure: { label: "Unsure", cls: "bg-warning-soft text-warning" },
  info: null,
} as const

function eventText(e: LeadDetail["events"][number]): string {
  const d = e.detail as Record<string, string | number | boolean | undefined>
  switch (e.type) {
    case "lead_received":
      return `Opted in via ${sourceLabel(String(d.source))}`
    case "call_started":
      return Number(d.attempt) > 1 ? `Call placed (attempt ${d.attempt})` : "Call placed"
    case "call_failed_to_start":
      return "Call couldn't be started"
    case "answer":
      return `Answered ${String(d.question_id).replace(/_/g, " ")}: “${d.answer}”`
    case "screening_complete":
      return `Screening complete: ${{ fit: "looks like a fit", not_a_fit: "not a fit", needs_review: "needs review" }[String(d.result)] ?? d.result}`
    case "visit_booked":
      return `Visit booked for ${formatVisit(String(d.starts_at))}`
    case "sms_sent":
      return `Text sent to ${d.to}`
    case "sms_failed":
      return `Text to ${d.to} failed`
    case "call_ended":
      return `Call ended${d.duration_secs ? ` after ${formatDuration(Number(d.duration_secs))}` : ""}${d.voicemail ? " (voicemail left)" : ""}`
    case "call_not_connected":
      return `Call didn't connect (${d.reason})`
    case "call_result_missing":
      return "No call result received, handed to the team"
    case "retry_scheduled":
      return `Retry scheduled for ${formatTime(String(d.at))}`
    case "status": {
      const label = STATUS[d.status as keyof typeof STATUS]?.label ?? d.status
      return `Status → ${label}`
    }
    default:
      return e.type.replace(/_/g, " ")
  }
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Transcript({ call, name }: { call: CallRecord; name: string }) {
  if (!call.transcript?.length) {
    return <p className="text-sm text-muted-foreground">{call.ended_at ? "No transcript for this call." : "The transcript appears when the call ends."}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {call.transcript.map((t, i) => {
        const msg = t.message?.trim()
        return (
          <div key={i} className="contents">
            {msg && (
              <div className={cn("flex flex-col gap-0.5", t.role === "agent" ? "items-start" : "items-end")}>
                <span className="px-1 text-[11px] font-medium text-muted-foreground">{t.role === "agent" ? "Ava" : name}</span>
                <p
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    t.role === "agent" ? "rounded-tl-md bg-brand-soft text-foreground" : "rounded-tr-md bg-muted"
                  )}
                >
                  {msg}
                </p>
              </div>
            )}
            {(t.tool_calls ?? []).filter(Boolean).map((tool, j) => (
              <span key={j} className="flex items-center gap-1.5 self-start px-1 text-xs text-muted-foreground">
                <Wrench className="size-3" aria-hidden /> {tool.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function LeadSheet({ leadId, onClose }: { leadId: number | null; onClose: () => void }) {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [callId, setCallId] = useState<number | null>(null)

  useEffect(() => {
    if (leadId == null) return
    let alive = true
    let last = ""
    const ctrl = new AbortController()
    const load = () =>
      api<LeadDetail>(`/leads/${leadId}`, ctrl.signal)
        .then((d) => {
          const key = JSON.stringify(d)
          if (alive && key !== last) {
            last = key
            setLead(d)
          }
        })
        .catch((e) => {
          if (!(e instanceof AuthError) && (e as Error).name !== "AbortError") console.warn(e)
        })
    load()
    const timer = setInterval(() => !document.hidden && load(), 4000)
    return () => {
      alive = false
      clearInterval(timer)
      ctrl.abort()
    }
  }, [leadId])

  const calls = lead ? [...lead.calls].reverse() : []
  const call = calls.find((c) => c.id === callId) ?? calls.find((c) => c.transcript?.length) ?? calls[0]
  const summary = calls.find((c) => c.summary)?.summary
  const answers = lead ? Object.values(Object.fromEntries(lead.screening.answers.map((a) => [a.question_id, a]))) : []

  return (
    <Sheet open={leadId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl">
        {!lead ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Loading lead</SheetTitle>
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="gap-3 border-b p-6 pr-12">
              <div className="flex items-start gap-3">
                <Avatar className="size-11">
                  <AvatarFallback className="bg-muted font-medium">{initials(lead)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg">{displayName(lead)}</SheetTitle>
                  <SheetDescription className="mt-0.5">
                    {formatPhone(lead.phone)} · {sourceLabel(lead.source)} · opted in {formatTime(lead.created_at)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge lead={lead} />
                {lead.visit && (
                  <Badge className="h-6 gap-1.5 rounded-full bg-good-soft px-2.5 text-good">
                    <CalendarCheck aria-hidden /> {formatVisit(lead.visit.starts_at_local)}
                  </Badge>
                )}
                {lead.seconds_to_first_call != null && (
                  <Badge variant="outline" className="h-6 gap-1.5 rounded-full px-2.5 font-normal text-muted-foreground">
                    <Phone aria-hidden /> Called in {formatSeconds(lead.seconds_to_first_call)}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <Tabs defaultValue="overview" className="min-h-0 flex-1 gap-0">
              <TabsList variant="line" className="w-full justify-start gap-4 border-b px-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="conversation">Conversation</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <ScrollArea className="min-h-0 flex-1">
                <TabsContent value="overview" className="space-y-7 p-6">
                  <Section title="Call summary">
                    <p className="rounded-xl bg-muted/60 p-4 text-sm leading-relaxed text-foreground/85">
                      {summary ?? (lead.status === "calling" ? "Call in progress. The summary appears when it ends." : "No summary yet.")}
                    </p>
                  </Section>

                  {lead.flags.length > 0 && (
                    <Section title="Flags for the team">
                      <ul className="space-y-2">
                        {lead.flags.map((f, i) => (
                          <li
                            key={i}
                            className={cn(
                              "flex gap-2.5 rounded-xl px-3.5 py-3 text-sm",
                              f.type === "emergency" ? "bg-critical-soft text-critical" : "bg-warning-soft text-warning"
                            )}
                          >
                            {f.type === "emergency" ? <Siren className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
                            <span className="text-foreground/85">{f.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section title="Pre-screen">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{SCREENING_STATE[lead.screening.state]}</span>
                      {lead.screening.bmi != null && (
                        <Badge variant="outline" className="rounded-full font-normal">
                          BMI {lead.screening.bmi}
                        </Badge>
                      )}
                      {lead.screening.reason && <span className="text-muted-foreground">· {lead.screening.reason}</span>}
                    </div>
                    {answers.length ? (
                      <div className="overflow-hidden rounded-xl border">
                        {answers.map((a, i) => {
                          const v = VERDICT[a.verdict]
                          return (
                            <div key={a.question_id} className={cn("flex items-start justify-between gap-4 px-4 py-3 text-sm", i && "border-t")}>
                              <span className="text-muted-foreground">{a.question || a.question_id}</span>
                              <span className="flex shrink-0 items-center gap-2 font-medium">
                                {a.answer}
                                {v && <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", v.cls)}>{v.label}</span>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No answers yet.</p>
                    )}
                  </Section>

                  <Section title="Consent">
                    <div className="rounded-xl border p-4 text-sm">
                      <div className="font-medium">
                        {lead.consent.given ? "Given" : "Not given"} · {formatTime(lead.consent.at)}
                      </div>
                      <p className="mt-1 text-muted-foreground">{lead.consent.text || "—"}</p>
                    </div>
                  </Section>
                </TabsContent>

                <TabsContent value="conversation" className="space-y-4 p-6">
                  {call ? (
                    <>
                      {calls.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                          {calls.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setCallId(c.id)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs transition-colors",
                                c.id === call.id ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
                              )}
                            >
                              Attempt {c.attempt_no}
                              {c.duration_secs ? ` · ${formatDuration(c.duration_secs)}` : ""}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {formatTime(call.started_at)}
                        {call.duration_secs ? ` · ${formatDuration(call.duration_secs)}` : ""}
                        {!call.ended_at && " · in progress"}
                      </p>
                      {call.recording_url && call.ended_at && (
                        <audio controls preload="none" src={call.recording_url} className="h-10 w-full">
                          <track kind="captions" />
                        </audio>
                      )}
                      <Separator />
                      <Transcript call={call} name={displayName({ first_name: lead.first_name, last_name: "" })} />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No calls yet.</p>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="p-6">
                  <ol className="relative space-y-4 border-l pl-5">
                    {lead.events.map((e, i) => (
                      <li key={i} className="relative">
                        <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-border ring-4 ring-background" aria-hidden />
                        <p className="text-sm">{eventText(e)}</p>
                        <p className="font-mono text-xs text-muted-foreground">{formatTime(e.at, true)}</p>
                      </li>
                    ))}
                  </ol>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
