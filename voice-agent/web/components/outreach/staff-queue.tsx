"use client"

import { CheckCircle2, ClipboardList, Hand, PhoneCall, Siren, UserCheck, X } from "lucide-react"
import { AnimatePresence, m } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { post } from "@/lib/api"
import { displayName, timeAgo } from "@/lib/format"
import type { OutreachRow } from "@/lib/types"
import { cn } from "@/lib/utils"

const reasonOf = (r: OutreachRow) => r.flags.at(-1)?.detail || r.status_reason

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-good-soft text-good">
        <CheckCircle2 className="size-5" aria-hidden />
      </span>
      <p className="font-medium">All clear</p>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

/** What a person in the office needs to do: patients Ava handed over, and charts to check before calling. */
export function StaffQueue({
  rows,
  onSelect,
  onChanged,
}: {
  rows: OutreachRow[]
  onSelect: (id: number) => void
  onChanged: () => void
}) {
  const staff = rows
    .filter((r) => r.status === "needs_human" || r.status === "emergency")
    .sort((a, b) => Number(b.status === "emergency") - Number(a.status === "emergency"))
  const review = rows.filter((r) => r.status === "chart_review")
  const [tab, setTab] = useState<"staff" | "review">("staff")
  const [busy, setBusy] = useState<number | null>(null)

  const act = async (row: OutreachRow, path: string, done: string) => {
    setBusy(row.id)
    try {
      await post(`/leads/${row.id}/${path}`)
      toast.success(done, { description: displayName(row) })
      onChanged()
    } catch (e) {
      toast.error("That didn't work", { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const list = tab === "staff" ? staff : review
  return (
    <Card className="gap-0 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <CardHeader className="flex flex-col gap-3 border-b py-4">
        <div className="flex items-center justify-between">
          <CardTitle>Staff queue</CardTitle>
          <Badge
            className={cn(
              "h-6 rounded-full px-2.5 tabular",
              staff.length ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"
            )}
          >
            {staff.length + review.length}
          </Badge>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="h-8 w-full">
            <TabsTrigger value="staff" className="flex-1 gap-1.5 text-xs">
              Needs a person <span className="text-muted-foreground tabular">{staff.length}</span>
            </TabsTrigger>
            <TabsTrigger value="review" className="flex-1 gap-1.5 text-xs">
              Chart review <span className="text-muted-foreground tabular">{review.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      {list.length === 0 ? (
        <Empty text={tab === "staff" ? "Patients Ava hands to the office land here." : "No charts waiting. Everyone pre-screened is being called."} />
      ) : (
        <ul className="max-h-[560px] divide-y overflow-y-auto">
          <AnimatePresence initial={false}>
            {list.map((r) => {
              const emergency = r.status === "emergency"
              const Icon = tab === "review" ? ClipboardList : emergency ? Siren : Hand
              return (
                <m.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-3 px-4 py-3.5">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        emergency ? "bg-critical-soft text-critical" : "bg-warning-soft text-warning"
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => onSelect(r.id)}
                        className="flex w-full items-baseline justify-between gap-2 text-left focus-visible:outline-none focus-visible:underline"
                      >
                        <span className="truncate text-sm font-medium">{displayName(r)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.last_activity?.at)}</span>
                      </button>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{reasonOf(r)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tab === "review" ? (
                          <Button size="xs" disabled={busy === r.id} onClick={() => act(r, "clear", "Cleared: Ava will call")}>
                            <UserCheck aria-hidden /> Chart checked, call
                          </Button>
                        ) : (
                          <>
                            {r.status !== "emergency" && (
                              <Button size="xs" variant="outline" disabled={busy === r.id} onClick={() => act(r, "restart", "Ava will try again")}>
                                <PhoneCall aria-hidden /> Have Ava call again
                              </Button>
                            )}
                            <Button size="xs" variant="outline" disabled={busy === r.id} onClick={() => act(r, "contacted", "Marked as contacted")}>
                              <CheckCircle2 aria-hidden /> I reached them
                            </Button>
                          </>
                        )}
                        <Button size="xs" variant="ghost" disabled={busy === r.id} onClick={() => act(r, "drop", "Dropped from outreach")}>
                          <X aria-hidden /> Drop
                        </Button>
                      </div>
                    </div>
                  </div>
                </m.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  )
}
