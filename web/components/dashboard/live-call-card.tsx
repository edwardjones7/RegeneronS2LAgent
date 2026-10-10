"use client"

import { Check, PhoneCall, PhoneIncoming, PhoneOutgoing, UserRound, Wrench } from "lucide-react"
import { AnimatePresence, m } from "motion/react"
import { useEffect, useRef } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useNow } from "@/hooks/use-url"
import { displayName, initials, parseTime } from "@/lib/format"
import type { LiveCall } from "@/lib/types"
import { cn } from "@/lib/utils"

const PHASE_LABEL: Record<LiveCall["phase"], string> = {
  dialing: "Dialing",
  ringing: "Ringing",
  in_progress: "On the call",
  ending: "Wrapping up",
  ended: "Call ended",
}

/** Animated voice bars; calm when not speaking. */
function Waveform({ active }: { active: boolean }) {
  return (
    <span className="flex h-6 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full bg-brand/70", active ? "animate-[wave_1.1s_ease-in-out_infinite]" : "h-1")}
          style={active ? { animationDelay: `${(i * 83) % 600}ms`, height: `${30 + ((i * 37) % 70)}%` } : undefined}
        />
      ))}
    </span>
  )
}

function Stopwatch({ call }: { call: LiveCall }) {
  const now = useNow(100)
  const optIn = parseTime(call.opt_in_at)!.getTime()
  const frozen = call.seconds_to_ring ?? null
  const secs = frozen ?? Math.max(0, (now - optIn) / 1000)
  return (
    <div className="flex flex-col items-start">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {frozen != null ? "Opt-in → phone ringing" : "Since opt-in"}
      </span>
      <span className={cn("font-mono text-4xl font-semibold tracking-tight tabular", frozen != null ? "text-good" : "text-foreground")}>
        {secs.toFixed(1)}
        <span className="text-xl text-muted-foreground">s</span>
      </span>
    </div>
  )
}

function Milestones({ call }: { call: LiveCall }) {
  const steps = [
    { label: "Opted in", at: 0, done: true, icon: UserRound },
    { label: "Call placed", at: call.seconds_to_place, done: call.seconds_to_place != null, icon: PhoneOutgoing },
    { label: "Ringing", at: call.seconds_to_ring, done: call.seconds_to_ring != null, icon: PhoneIncoming },
    { label: "Answered", at: call.seconds_to_answer, done: call.seconds_to_answer != null, icon: PhoneCall },
  ]
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          {i > 0 && <span className={cn("h-px w-5 transition-colors", s.done ? "bg-good" : "bg-border")} aria-hidden />}
          <m.span
            initial={false}
            animate={{ scale: s.done ? 1 : 0.96, opacity: s.done ? 1 : 0.55 }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              s.done ? "bg-good-soft text-good" : "bg-muted text-muted-foreground"
            )}
          >
            {s.done ? <Check className="size-3" aria-hidden /> : <s.icon className="size-3" aria-hidden />}
            {s.label}
            {s.done && s.at != null && i > 0 && <span className="font-mono tabular opacity-80">{s.at.toFixed(1)}s</span>}
          </m.span>
        </li>
      ))}
    </ol>
  )
}

function LiveTranscript({ call }: { call: LiveCall }) {
  const ref = useRef<HTMLDivElement>(null)
  const turns = call.transcript.filter((t) => t.message?.trim() || t.tool_calls?.length)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [turns.length])
  return (
    <div ref={ref} className="flex h-64 flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
      {turns.length === 0 && (
        <p className="m-auto text-sm text-muted-foreground">{call.phase === "in_progress" ? "Listening…" : "Waiting for them to pick up…"}</p>
      )}
      <AnimatePresence initial={false}>
        {turns.map((t, i) => (
          <m.div
            key={`${i}-${t.role}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn("flex flex-col gap-0.5", t.role === "agent" ? "items-start" : "items-end")}
          >
            {t.message?.trim() && (
              <p
                className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  t.role === "agent" ? "rounded-tl-md bg-brand-soft" : "rounded-tr-md bg-muted"
                )}
              >
                {t.message}
              </p>
            )}
            {(t.tool_calls ?? []).filter(Boolean).map((tool, j) => (
              <span key={j} className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                <Wrench className="size-3" aria-hidden /> {tool.replace(/_/g, " ")}
              </span>
            ))}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function LiveCallCard({ call, onOpen }: { call: LiveCall; onOpen: (id: number) => void }) {
  const live = call.phase === "in_progress"
  const progress = call.total ? Math.min(100, Math.round((call.answered / call.total) * 100)) : 0
  return (
    <m.div layout initial={{ opacity: 0, y: -10, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.99 }}>
      <Card className="relative gap-0 overflow-hidden py-0 shadow-[0_8px_30px_-12px_rgba(6,91,170,0.35)] ring-brand/25">
        <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-brand-soft">
          {call.phase !== "ended" && <div className="h-full w-1/3 animate-[sweep_1.6s_ease-in-out_infinite] bg-brand" />}
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-center gap-3">
              <span className="relative">
                <Avatar className="size-11">
                  <AvatarFallback className="bg-brand-soft font-medium text-brand">{initials(call)}</AvatarFallback>
                </Avatar>
                {call.phase !== "ended" && (
                  <span className="absolute -inset-1 animate-ping rounded-full border-2 border-brand/30 motion-reduce:hidden" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <button onClick={() => onOpen(call.lead_id)} className="truncate text-left font-semibold hover:underline">
                  {displayName(call)}
                </button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", call.phase === "ended" ? "" : "text-brand")}>
                    {call.phase !== "ended" && <span className="size-1.5 rounded-full bg-current animate-live" aria-hidden />}
                    {PHASE_LABEL[call.phase]}
                  </span>
                  {call.source === "simulation" && (
                    <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px] font-normal">
                      text simulation
                    </Badge>
                  )}
                </div>
              </div>
              <div className="ml-auto">
                <Waveform active={live} />
              </div>
            </div>

            <Stopwatch call={call} />
            <Milestones call={call} />

            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Pre-screen</span>
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {call.answered} of {call.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <m.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
              </div>
              <p className="min-h-5 text-sm text-muted-foreground">
                {call.current_question ? (
                  <>
                    Now asking: <span className="text-foreground">{call.current_question.ask}</span>
                  </>
                ) : call.screening_state === "fit" ? (
                  "Screening complete: looks like a fit"
                ) : null}
              </p>
            </div>
          </div>
          <div className="border-t bg-muted/30 p-6 lg:border-t-0 lg:border-l">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Live transcript</span>
              <span className="text-xs text-muted-foreground">Ava · automated assistant</span>
            </div>
            <LiveTranscript call={call} />
          </div>
        </div>
      </Card>
    </m.div>
  )
}
