import { Ban, CheckCircle2, CircleSlash, Clock, Hand, Siren } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { STATUS, formatTime, type Tone } from "@/lib/format"
import type { LeadSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

export const TONE_CLASS: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  live: "bg-brand-soft text-brand",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
}

const ICONS = {
  booked: CheckCircle2,
  needs_human: Hand,
  emergency: Siren,
  no_answer: Clock,
  queued: Clock,
  opted_out: Ban,
  not_a_fit: CircleSlash,
} as const

export function StatusBadge({ lead, className }: { lead: Pick<LeadSummary, "status" | "next_attempt_at">; className?: string }) {
  const s = STATUS[lead.status] ?? STATUS.new
  const Icon = ICONS[lead.status as keyof typeof ICONS]
  let label = s.label
  if ((lead.status === "no_answer" || lead.status === "queued") && lead.next_attempt_at) {
    label += ` · ${lead.status === "queued" ? "calls" : "retry"} ${formatTime(lead.next_attempt_at)}`
  }
  return (
    <Badge className={cn("h-6 gap-1.5 rounded-full px-2.5 font-medium", TONE_CLASS[s.tone], className)}>
      {lead.status === "calling" ? (
        <span className="size-1.5 rounded-full bg-current animate-live" aria-hidden />
      ) : (
        Icon && <Icon aria-hidden />
      )}
      {label}
    </Badge>
  )
}
