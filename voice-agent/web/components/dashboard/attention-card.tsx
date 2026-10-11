import { CheckCircle2, Hand, MessageCircleQuestion, Siren } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { displayName, formatPhone, timeAgo } from "@/lib/format"
import type { LeadSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

function describe(l: LeadSummary) {
  const flag = l.flags.at(-1)
  const kind = l.status === "emergency" || flag?.type === "emergency" ? "emergency" : /medical/i.test(flag?.detail ?? "") ? "medical" : "human"
  return {
    kind,
    title:
      kind === "emergency" ? "Possible emergency" : kind === "medical" ? "Asked a medical question" : "Wants a person",
    detail: flag?.detail ?? l.status_reason,
    at: flag?.at ? `${flag.at}Z` : l.created_at,
  }
}

const STYLE = {
  emergency: { icon: Siren, cls: "bg-critical-soft text-critical" },
  medical: { icon: MessageCircleQuestion, cls: "bg-warning-soft text-warning" },
  human: { icon: Hand, cls: "bg-warning-soft text-warning" },
}

export function AttentionCard({ items, onSelect }: { items: LeadSummary[]; onSelect: (id: number) => void }) {
  const sorted = [...items].sort((a, b) => Number(b.status === "emergency") - Number(a.status === "emergency"))
  return (
    <Card className="gap-0 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <CardHeader className="flex flex-row items-center justify-between border-b py-4">
        <CardTitle>Needs your attention</CardTitle>
        <Badge className={cn("h-6 rounded-full px-2.5 tabular", items.length ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
          {items.length}
        </Badge>
      </CardHeader>
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-good-soft text-good">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <p className="font-medium">All clear</p>
          <p className="text-sm text-muted-foreground">Escalations and emergencies land here.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {sorted.map((l) => {
            const d = describe(l)
            const { icon: Icon, cls } = STYLE[d.kind as keyof typeof STYLE]
            return (
              <li key={l.id}>
                <button
                  onClick={() => onSelect(l.id)}
                  className="flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", cls)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {displayName(l)} · {d.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(d.at)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{d.detail}</span>
                    <span className="mt-1 block font-mono text-xs text-muted-foreground">{formatPhone(l.phone)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
