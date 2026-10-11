"use client"

import { Check, Inbox, MessageSquareText, Phone } from "lucide-react"
import { m } from "motion/react"
import { toast } from "sonner"

import { container, item } from "@/components/dashboard/motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePoll } from "@/hooks/use-dashboard-data"
import { post } from "@/lib/api"
import { formatPhone, timeAgo } from "@/lib/format"
import type { InboxMessage } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Calls and texts from people Ava couldn't match to a patient. */
export function InboxView() {
  const inbox = usePoll<InboxMessage[]>("/inbox", 5000)
  const resolve = async (msg: InboxMessage) => {
    try {
      await post(`/inbox/${msg.id}/resolve`)
      inbox.reload()
    } catch (e) {
      toast.error("Couldn't update", { description: (e as Error).message })
    }
  }
  const open = (inbox.data ?? []).filter((x) => !x.resolved)
  const done = (inbox.data ?? []).filter((x) => x.resolved)

  return (
    <m.div variants={container} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-6">
      <m.div variants={item}>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Callers and texts Ava couldn&apos;t match to a patient. She took a message and said someone from the office would call back.
        </p>
      </m.div>
      {!inbox.data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : inbox.data.length === 0 ? (
        <m.div variants={item}>
          <Card className="items-center gap-2 p-12 text-center">
            <Inbox className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">Nothing here</p>
            <p className="text-sm text-muted-foreground">Messages from unknown callers land here.</p>
          </Card>
        </m.div>
      ) : (
        <m.div variants={item}>
          <Card className="gap-0 divide-y py-0">
            {[...open, ...done].map((msg) => (
              <div key={msg.id} className={cn("flex gap-3 px-5 py-4", msg.resolved && "opacity-55")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  {msg.channel === "call" ? <Phone className="size-4" aria-hidden /> : <MessageSquareText className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{msg.name || formatPhone(msg.from_phone) || "Unknown caller"}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(msg.at)}</span>
                  </div>
                  <p className="mt-1 text-sm">{msg.text || "(no message)"}</p>
                  {msg.from_phone && <p className="mt-1 font-mono text-xs text-muted-foreground">{formatPhone(msg.from_phone)}</p>}
                </div>
                {!msg.resolved && (
                  <Button size="xs" variant="outline" onClick={() => resolve(msg)}>
                    <Check aria-hidden /> Done
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </m.div>
      )}
    </m.div>
  )
}
