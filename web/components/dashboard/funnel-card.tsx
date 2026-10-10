import { m } from "motion/react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Funnel } from "@/lib/types"

const STEPS: { key: keyof Funnel; label: string }[] = [
  { key: "opted_in", label: "Opted in" },
  { key: "reached", label: "Reached by phone" },
  { key: "screened", label: "Finished pre-screen" },
  { key: "looked_like_fit", label: "Looked like a fit" },
  { key: "booked", label: "Visit booked" },
]

/** Single-series funnel: one hue, direct labels, hover for conversion. */
export function FunnelCard({ funnel }: { funnel: Funnel }) {
  const top = Math.max(1, funnel.opted_in)
  return (
    <Card className="gap-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <CardHeader>
        <CardTitle>Enrollment funnel</CardTitle>
        <CardDescription className="mt-0.5">From ad opt-in to a booked screening visit</CardDescription>
      </CardHeader>
      <ol className="space-y-3 px-4" aria-label="Enrollment funnel">
        {STEPS.map((s, i) => {
          const v = funnel[s.key]
          const prev = i ? funnel[STEPS[i - 1].key] : v
          const pct = Math.round((v / top) * 100)
          return (
            <li key={s.key} className="grid grid-cols-[9.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-muted-foreground">{s.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block h-6 rounded-md bg-muted" aria-label={`${s.label}: ${v}`}>
                    <m.span
                      className="block h-full rounded-md bg-brand"
                      style={{ opacity: 1 - i * 0.12 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${v ? Math.max(pct, 2) : 0}%` }}
                      transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {v} {s.label.toLowerCase()} · {pct}% of opt-ins{i > 0 && prev ? ` · ${Math.round((v / prev) * 100)}% of previous step` : ""}
                </TooltipContent>
              </Tooltip>
              <span className="text-right font-medium tabular">{v}</span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
