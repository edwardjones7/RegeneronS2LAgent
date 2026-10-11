"use client"

import { ArrowRight, CheckCircle2, ClipboardList, ExternalLink, Lock, PhoneOutgoing, ShieldCheck, Users } from "lucide-react"
import { m } from "motion/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { usePractice } from "@/components/app-shell"
import { container, item } from "@/components/dashboard/motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { usePoll } from "@/hooks/use-dashboard-data"
import { post } from "@/lib/api"
import { timeAgo } from "@/lib/format"
import type { PracticeProfile, TrialCard } from "@/lib/types"
import { cn } from "@/lib/utils"

function AcceptDialog({
  trial,
  profile,
  onClose,
  onAccepted,
}: {
  trial: TrialCard
  profile: PracticeProfile | null
  onClose: () => void
  onAccepted: () => void
}) {
  const [name, setName] = useState(profile?.doctor_name ?? "")
  const [busy, setBusy] = useState(false)
  const { practiceId } = usePractice()
  const accept = async () => {
    setBusy(true)
    try {
      const r = await post<{ candidates: number; chart_review: number; accepted_by: string }>(
        `/practices/${practiceId}/trials/${trial.nct_id}/accept`,
        { doctor_name: name }
      )
      toast.success(`Accepted. Ava is calling ${r.candidates} patients`, {
        description: `From ${r.accepted_by}'s office. ${r.chart_review} wait for a chart check first.`,
      })
      onAccepted()
    } catch (e) {
      toast.error("Couldn't accept", { description: (e as Error).message })
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take on this trial?</DialogTitle>
          <DialogDescription>
            Ava will call your {trial.candidates} pre-screened patients from your office, confirm who she&apos;s talking to, and book
            screening visits here. You don&apos;t need to do anything else.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="doctor">Your name, as your patients know you</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Dr.</span>
            <Input id="doctor" value={name} onChange={(e) => setName(e.target.value)} placeholder="Last name" autoFocus />
          </div>
          <p className="text-xs text-muted-foreground">Ava says she&apos;s calling from your office. Demo: use your own name.</p>
        </div>
        <ul className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <ShieldCheck className="size-3.5 shrink-0 text-good" aria-hidden /> Nothing about the study is said until the patient confirms
            their date of birth.
          </li>
          <li className="flex gap-2">
            <Lock className="size-3.5 shrink-0 text-good" aria-hidden /> Texts and voicemails never name the study or a condition.
          </li>
          <li className="flex gap-2">
            <Users className="size-3.5 shrink-0 text-good" aria-hidden /> Patients stay with your practice.
          </li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not now
          </Button>
          <Button onClick={accept} disabled={busy || !name.trim()}>
            <PhoneOutgoing aria-hidden /> Accept and start calling
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TrialsView() {
  const { practiceId, practices } = usePractice()
  const pid = practiceId ? encodeURIComponent(practiceId) : null
  const trials = usePoll<TrialCard[]>(pid && `/practices/${pid}/trials`, 15000)
  const profile = usePoll<PracticeProfile>(pid && `/practices/${pid}/profile`, 60000).data
  const [open, setOpen] = useState<TrialCard | null>(null)
  const router = useRouter()
  const name = practices?.find((p) => p.id === practiceId)?.name

  if (!trials.data) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    )
  }
  const fillable = trials.data.filter((t) => t.candidates > 0)
  const others = trials.data.filter((t) => t.candidates === 0)

  return (
    <m.div key={practiceId} variants={container} initial="hidden" animate="show" className="space-y-6">
      <m.div variants={item}>
        <p className="text-sm text-muted-foreground">{name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Trials you can fill</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Pre-screened against your own patients. Accepting starts outreach to the candidates automatically. Demo stand-in for the doctor
          app&apos;s accept button.
        </p>
      </m.div>

      <div className="grid gap-4 md:grid-cols-2">
        {fillable.map((t) => (
          <m.div key={t.nct_id} variants={item}>
            <Card className={cn("h-full gap-4 p-6", t.accepted && "ring-1 ring-good/30")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{t.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.official_title}</p>
                </div>
                <Badge variant="outline" className="shrink-0 rounded-full font-normal">
                  {t.phase}
                </Badge>
              </div>
              <div className="flex gap-6">
                <div>
                  <div className="text-3xl font-semibold tracking-tight tabular">{t.candidates}</div>
                  <div className="text-xs text-muted-foreground">pre-screen candidates</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-3xl font-semibold tracking-tight text-warning tabular">
                    {t.chart_review}
                    <ClipboardList className="size-4" aria-hidden />
                  </div>
                  <div className="text-xs text-muted-foreground">need chart review</div>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <a href={t.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                  {t.nct_id} · {t.sponsor} <ExternalLink className="size-3" aria-hidden />
                </a>
                {t.accepted ? (
                  <Button variant="outline" size="sm" onClick={() => router.push("/")}>
                    <CheckCircle2 className="text-good" aria-hidden /> Accepted {t.accepted_at ? timeAgo(t.accepted_at) : ""} · View outreach
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setOpen(t)} disabled={!t.callable}>
                    Accept trial <ArrowRight aria-hidden />
                  </Button>
                )}
              </div>
            </Card>
          </m.div>
        ))}
      </div>

      {others.length > 0 && (
        <m.div variants={item} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Not a fit for this practice&apos;s patients</h2>
          <Card className="divide-y gap-0 py-0">
            {others.map((t) => (
              <div key={t.nct_id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  {t.title} <span className="font-mono text-xs text-muted-foreground">{t.nct_id}</span>
                </span>
                <span className="text-muted-foreground">
                  0 candidates{t.chart_review ? ` · ${t.chart_review} need chart review` : ""}
                </span>
              </div>
            ))}
          </Card>
        </m.div>
      )}

      {open && (
        <AcceptDialog
          trial={open}
          profile={profile}
          onClose={() => setOpen(null)}
          onAccepted={() => {
            setOpen(null)
            trials.reload()
            router.push("/")
          }}
        />
      )}
    </m.div>
  )
}
