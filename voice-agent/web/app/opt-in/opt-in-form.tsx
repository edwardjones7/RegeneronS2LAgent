"use client"

import { ArrowRight, CalendarCheck, CheckCircle2, Clock, Loader2, MessageSquare, PhoneCall } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { PhoneMockup } from "./phone-mockup"

const CAMPAIGN_ID = "olatorepatide-nct07685808"
const CONSENT =
  "I agree to be called and texted at this number, including by an automated assistant, about this research study. Calls may be recorded. Consent is not a condition of participation. Reply STOP to opt out of texts."

function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^1/, "").slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

type Result = { status: string }

const NEXT_STEPS = [
  { icon: PhoneCall, text: "Ava, an automated assistant, will call and explain the study in a sentence" },
  { icon: MessageSquare, text: "She'll ask a few quick questions and answer yours" },
  { icon: CalendarCheck, text: "If it looks like a fit, you can book a screening visit on the call" },
]

export function OptInForm() {
  const ids = useId()
  const [first, setFirst] = useState("")
  const [last, setLast] = useState("")
  const [phone, setPhone] = useState("")
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)

  const phoneValid = phone.replace(/\D/g, "").length === 10

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!phoneValid) return setError("Enter a 10-digit US mobile number.")
    if (!consent) return setError("Please agree to be contacted so we can call you.")
    setError("")
    setPending(true)
    try {
      const res = await fetch("/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: CAMPAIGN_ID,
          first_name: first.trim(),
          last_name: last.trim(),
          phone,
          consent_given: consent,
          consent_text: CONSENT,
          source: "demo_form",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.")
      setResult(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  if (result) {
    const calling = result.status === "calling"
    const queued = result.status === "queued"
    return (
      <Card className="shadow-[0_8px_32px_-12px_rgba(16,24,40,0.14)]" aria-live="polite">
        <CardContent className="animate-in py-4 duration-300 fade-in zoom-in-95">
          <div className="flex flex-col items-center text-center">
            {calling && <PhoneMockup />}
            <span className={cn("relative grid size-14 place-items-center rounded-full bg-good-soft text-good", calling && "hidden")}>
              {calling && <span className="absolute inset-0 animate-ping rounded-full bg-good/20 motion-reduce:hidden" aria-hidden />}
              {calling ? <PhoneCall className="size-6" aria-hidden /> : queued ? <Clock className="size-6" aria-hidden /> : <CheckCircle2 className="size-6" aria-hidden />}
            </span>
            <h2 className="mt-6 text-xl font-semibold tracking-tight">
              {calling ? "Your phone will ring in a few seconds" : queued ? "We'll call you soon" : "Thanks, we've got your request"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {calling
                ? "Keep your phone nearby. The call comes from the research team's number."
                : queued
                  ? "It's outside calling hours right now, so we'll call as soon as they open."
                  : "Someone from the research team will be in touch."}
            </p>
          </div>
          {(calling || queued) && (
            <ol className="mt-6 space-y-3 rounded-xl bg-muted/60 p-4">
              {NEXT_STEPS.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background text-foreground/70 ring-1 ring-foreground/10">
                    <s.icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="pt-1">{s.text}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-[0_8px_32px_-12px_rgba(16,24,40,0.14)]">
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-tight">See if the study might be a fit</CardTitle>
        <CardDescription>Leave your number and we&apos;ll call you right away. It takes about five minutes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${ids}-first`}>First name</Label>
              <Input id={`${ids}-first`} autoComplete="given-name" required value={first} onChange={(e) => setFirst(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${ids}-last`}>Last name</Label>
              <Input id={`${ids}-last`} autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} className="h-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${ids}-phone`}>Mobile phone</Label>
            <Input
              id={`${ids}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(555) 555-0123"
              required
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              className="h-10 font-mono tabular"
              aria-describedby={`${ids}-phone-hint`}
            />
            <p id={`${ids}-phone-hint`} className="text-xs text-muted-foreground">
              Demo: use a teammate&apos;s verified number.
            </p>
          </div>
          <div className="flex gap-3 rounded-xl border bg-muted/40 p-3.5">
            <Checkbox id={`${ids}-consent`} checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <Label htmlFor={`${ids}-consent`} className="text-xs leading-relaxed font-normal text-muted-foreground">
              {CONSENT}
            </Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="group h-11 w-full bg-brand text-sm hover:bg-brand-strong" disabled={pending || !first.trim()}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Connecting…
              </>
            ) : (
              <>
                Call me now <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
