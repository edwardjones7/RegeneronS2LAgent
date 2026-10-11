import { Check } from "lucide-react"

import type { OutreachRow } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_TRIES = 3

/** The 3-try sequence at a glance: one dot per try, the last one tells you where it ended. */
export function SequenceDots({ row }: { row: Pick<OutreachRow, "attempts" | "status"> }) {
  const tries = Math.min(row.attempts, MAX_TRIES)
  const label =
    row.status === "booked"
      ? `Booked after ${tries} ${tries === 1 ? "try" : "tries"}`
      : `${tries} of ${MAX_TRIES} tries`
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label} title={label}>
      {Array.from({ length: MAX_TRIES }, (_, i) => {
        const done = i < tries
        const last = i === tries - 1
        const booked = last && row.status === "booked"
        const live = last && row.status === "calling"
        const staff = last && (row.status === "needs_human" || row.status === "emergency")
        return (
          <span
            key={i}
            className={cn(
              "grid size-4 place-items-center rounded-full border transition-colors",
              !done && "border-dashed border-muted-foreground/30",
              done && !last && "border-info/40 bg-info-soft",
              booked && "border-good bg-good text-white",
              live && "border-brand bg-brand-soft animate-live",
              staff && "border-warning bg-warning-soft",
              last && done && !booked && !live && !staff && "border-info bg-info-soft"
            )}
          >
            {booked && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
          </span>
        )
      })}
    </span>
  )
}
