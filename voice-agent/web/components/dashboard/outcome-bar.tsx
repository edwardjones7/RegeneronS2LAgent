import { m } from "motion/react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { OUTCOME_GROUPS } from "@/lib/format"
import type { Overview } from "@/lib/types"

export function OutcomeBar({ overview }: { overview: Overview }) {
  const total = overview.total_leads
  const groups = OUTCOME_GROUPS.map((g) => ({ ...g, count: g.statuses.reduce((n, s) => n + (overview.by_status[s] ?? 0), 0) })).filter(
    (g) => g.count > 0
  )

  return (
    <Card className="gap-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <CardHeader className="flex flex-row items-baseline justify-between">
        <div>
          <CardTitle>Where every lead stands</CardTitle>
          <CardDescription className="mt-0.5">Outcome of every opt-in in this campaign</CardDescription>
        </div>
        <span className="text-sm text-muted-foreground tabular">
          {total} lead{total === 1 ? "" : "s"}
        </span>
      </CardHeader>
      <div className="px-4">
        <div
          className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={groups.length ? `Lead outcomes: ${groups.map((g) => `${g.count} ${g.label}`).join(", ")}` : "No leads yet"}
        >
          {groups.map((g, i) => (
            <Tooltip key={g.id}>
              <TooltipTrigger asChild>
                <m.span
                  className="block h-full first:rounded-l-full last:rounded-r-full"
                  style={{ backgroundColor: g.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(g.count / total) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.15 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {g.label}: {g.count} ({Math.round((g.count / total) * 100)}%)
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {groups.length === 0 && <li className="text-muted-foreground">No leads yet. Submit the ad opt-in form to place the first call.</li>}
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-[3px]" style={{ backgroundColor: g.color }} aria-hidden />
              {g.label}
              <span className="font-medium text-foreground tabular">{g.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
