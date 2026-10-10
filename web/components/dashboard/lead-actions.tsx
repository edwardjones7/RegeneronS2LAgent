"use client"

import { CalendarClock, CheckCheck, PhoneOutgoing, XCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, post } from "@/lib/api"
import { displayName } from "@/lib/format"
import type { LeadDetail, OpenSlot } from "@/lib/types"

async function run(label: string, fn: () => Promise<unknown>, onDone: () => void) {
  try {
    await fn()
    toast.success(label)
    onDone()
  } catch (e) {
    toast.error("That didn't work", { description: (e as Error).message })
  }
}

export function LeadActions({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const [note, setNote] = useState("")
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [slotId, setSlotId] = useState<string>("")
  const openFlags = lead.flags.some((f) => !f.resolved)
  const canResolve = openFlags || lead.status === "needs_human" || lead.status === "emergency"
  const canCall = !["opted_out", "calling"].includes(lead.status)

  return (
    <div className="flex flex-wrap gap-2">
      {canResolve && (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-brand hover:bg-brand-strong">
              <CheckCheck aria-hidden /> Resolve
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve {displayName(lead)}</DialogTitle>
              <DialogDescription>Marks the flags as handled and removes them from the attention queue.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="resolve-note">What happened? (optional)</Label>
              <Textarea id="resolve-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called back and answered their question." />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => run("Resolved", () => post(`/leads/${lead.id}/resolve`, { note }), onChanged)}>Resolve</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canCall && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => run(`Calling ${displayName(lead)} now`, () => post(`/leads/${lead.id}/call-again`), onChanged)}
        >
          <PhoneOutgoing aria-hidden /> Have Ava call again
        </Button>
      )}

      {lead.visit && (
        <>
          <Dialog
            onOpenChange={(o) => {
              if (o && !slots) api<OpenSlot[]>(`/campaigns/${encodeURIComponent(lead.campaign_id)}/slots`).then(setSlots)
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <CalendarClock aria-hidden /> Reschedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reschedule visit</DialogTitle>
                <DialogDescription>{displayName(lead)} gets a text with the new time.</DialogDescription>
              </DialogHeader>
              <Select value={slotId} onValueChange={setSlotId}>
                <SelectTrigger className="w-full" aria-label="New time">
                  <SelectValue placeholder={slots ? "Pick a new time" : "Loading open times…"} />
                </SelectTrigger>
                <SelectContent>
                  {(slots ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    disabled={!slotId}
                    onClick={() => run("Visit rescheduled", () => post(`/leads/${lead.id}/reschedule`, { slot_id: Number(slotId) }), onChanged)}
                  >
                    Reschedule
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive">
                <XCircle aria-hidden /> Cancel visit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel this visit?</DialogTitle>
                <DialogDescription>
                  {displayName(lead)} gets a text that the visit is cancelled, and the time opens back up.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Keep visit</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={() => run("Visit cancelled", () => post(`/leads/${lead.id}/cancel-visit`), onChanged)}>
                    Cancel visit
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

export function NotesSection({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!text.trim()) return
    setSaving(true)
    await run("Note added", () => post(`/leads/${lead.id}/notes`, { text }), () => {
      setText("")
      onChanged()
    })
    setSaving(false)
  }
  return (
    <div className="space-y-3">
      {lead.notes.length > 0 && (
        <ul className="space-y-2">
          {lead.notes.map((n, i) => (
            <li key={i} className="rounded-xl border bg-card p-3 text-sm">
              <p>{n.text}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{new Date(n.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note for the team…"
          aria-label="New note"
          className="min-h-10"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save()
          }}
        />
        <Button variant="outline" onClick={save} disabled={saving || !text.trim()}>
          Add
        </Button>
      </div>
    </div>
  )
}
