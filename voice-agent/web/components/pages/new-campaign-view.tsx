"use client"

import { ArrowRight, Check, ExternalLink, Loader2, Quote, Sparkles, Trash2, TriangleAlert } from "lucide-react"
import { AnimatePresence, m } from "motion/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useCampaign } from "@/components/app-shell"
import { container, item } from "@/components/dashboard/motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { post } from "@/lib/api"
import type { CampaignDraft } from "@/lib/types"
import { cn } from "@/lib/utils"

const EXAMPLES = [
  { id: "NCT06246916", label: "Advanced melanoma" },
  { id: "NCT07286214", label: "Polymyalgia rheumatica" },
  { id: "NCT07477704", label: "High cholesterol" },
]

const STEPS = ["Fetching the ClinicalTrials.gov record", "Reading the eligibility criteria", "Drafting the script with Gemini", "Fact-checking every claim against the record"]

const ROLE_LABEL: Record<string, string> = {
  require_yes: "Must be yes",
  disqualify_if_yes: "Yes = not a fit",
  info: "Info only",
}

function DraftProgress() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500)
    return () => clearInterval(t)
  }, [])
  return (
    <Card className="gap-4 p-6">
      {STEPS.map((s, i) => (
        <m.div key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: i <= step ? 1 : 0.4, x: 0 }} className="flex items-center gap-3 text-sm">
          {i < step ? (
            <span className="grid size-6 place-items-center rounded-full bg-good-soft text-good">
              <Check className="size-3.5" />
            </span>
          ) : i === step ? (
            <Loader2 className="size-6 animate-spin p-0.5 text-brand" />
          ) : (
            <span className="size-6 rounded-full border-2 border-dashed" />
          )}
          {s}
        </m.div>
      ))}
    </Card>
  )
}

function TestCall({ campaignId }: { campaignId: string }) {
  const [phone, setPhone] = useState("")
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const call = async () => {
    setBusy(true)
    try {
      const r = await post<{ status: string }>("/leads", {
        campaign_id: campaignId,
        first_name: "Test",
        last_name: "Caller",
        phone,
        consent_given: consent,
        consent_text: "Coordinator test call from the campaign builder",
        source: "web_form",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      toast.success(r.status === "calling" ? "Calling now" : `Lead ${r.status}`, { description: "Watch it live on the Overview page." })
    } catch (e) {
      toast.error("Couldn't place the call", { description: (e as Error).message })
    }
    setBusy(false)
  }
  return (
    <Card className="gap-4 p-6">
      <div>
        <CardTitle>Test the new script</CardTitle>
        <CardDescription className="mt-1">Have Ava call a verified phone using this campaign.</CardDescription>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="test-phone">Phone</Label>
          <Input id="test-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(201) 555-0123" className="font-mono" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} /> This person agreed to be called
        </label>
        <Button onClick={call} disabled={busy || !consent || phone.replace(/\D/g, "").length < 10} className="bg-brand hover:bg-brand-strong">
          Call
        </Button>
      </div>
    </Card>
  )
}

export function NewCampaignView() {
  const { setCampaignId } = useCampaign()
  const [nct, setNct] = useState("")
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<CampaignDraft | null>(null)
  const [approved, setApproved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const generate = async (id = nct) => {
    setNct(id)
    setLoading(true)
    setDraft(null)
    setApproved(null)
    try {
      setDraft(await post<CampaignDraft>("/campaigns/draft", { nct_id: id }))
    } catch (e) {
      toast.error("Couldn't draft that study", { description: (e as Error).message })
    }
    setLoading(false)
  }

  const c = draft?.campaign
  const update = (patch: Partial<NonNullable<typeof c>>) => draft && setDraft({ ...draft, campaign: { ...draft.campaign, ...patch } })

  const approve = async () => {
    if (!c) return
    setSaving(true)
    try {
      const r = await post<{ id: string }>("/campaigns", { campaign: c })
      setApproved(r.id)
      setCampaignId(r.id)
      toast.success("Campaign approved", { description: "New opt-ins for this study will be called with this script." })
    } catch (e) {
      toast.error("Couldn't save the campaign", { description: (e as Error).message })
    }
    setSaving(false)
  }

  return (
    <>
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Any ClinicalTrials.gov study, ready to call in minutes</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">New campaign</h1>
      </div>

      <Card className="mb-6 gap-4 p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            generate()
          }}
        >
          <Input
            value={nct}
            onChange={(e) => setNct(e.target.value.toUpperCase())}
            placeholder="NCT ID, e.g. NCT06246916"
            aria-label="NCT ID"
            className="h-11 font-mono text-base sm:max-w-sm"
          />
          <Button type="submit" disabled={loading || !/^NCT\d{8}$/.test(nct.trim())} className="h-11 gap-2 bg-brand hover:bg-brand-strong">
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with Gemini
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Try a Regeneron study:
          {EXAMPLES.map((ex) => (
            <button key={ex.id} onClick={() => generate(ex.id)} disabled={loading} className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted">
              {ex.label} <span className="font-mono">{ex.id}</span>
            </button>
          ))}
        </div>
      </Card>

      <AnimatePresence mode="wait">
        {loading && (
          <m.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DraftProgress />
          </m.div>
        )}

        {c && draft && !loading && (
          <m.div key={c.id} variants={container} initial="hidden" animate="show" className="space-y-6">
            <m.div variants={item}>
              <Card className="gap-3 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full font-mono font-normal">
                    {draft.study.nct_id}
                  </Badge>
                  {draft.study.phases.map((p) => (
                    <Badge key={p} variant="outline" className="rounded-full font-normal">
                      {p.replace("PHASE", "Phase ")}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="rounded-full font-normal">
                    {draft.study.status.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">Drafted by {draft.model}</span>
                </div>
                <h2 className="text-lg font-semibold tracking-tight">{draft.study.title}</h2>
                <a href={c.study_url} target="_blank" rel="noopener" className="inline-flex w-fit items-center gap-1 text-sm text-brand hover:underline">
                  View the public record <ExternalLink className="size-3" />
                </a>
              </Card>
            </m.div>

            <div className="grid gap-6 xl:grid-cols-2">
              <m.div variants={item} className="space-y-6">
                <Card className="gap-4 p-6">
                  <CardHeader className="px-0">
                    <CardTitle>What Ava says first</CardTitle>
                    <CardDescription>Edit anything before approving.</CardDescription>
                  </CardHeader>
                  <div className="space-y-2">
                    <Label htmlFor="short">Study name (spoken)</Label>
                    <Input id="short" value={c.study_short_name} onChange={(e) => update({ study_short_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="liner">One-line explanation</Label>
                    <Textarea id="liner" value={c.one_liner} onChange={(e) => update({ one_liner: e.target.value })} className="min-h-20" />
                  </div>
                </Card>

                <Card className="gap-4 p-6">
                  <CardHeader className="px-0">
                    <CardTitle>Approved facts</CardTitle>
                    <CardDescription>The only study information Ava may share. Each one quotes the public record.</CardDescription>
                  </CardHeader>
                  <ul className="space-y-2">
                    {c.approved_facts.map((f, i) => (
                      <li key={i} className="group rounded-xl border p-3">
                        <div className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                          <p className="flex-1 text-sm">{f.fact}</p>
                          <button
                            aria-label="Remove fact"
                            onClick={() => update({ approved_facts: c.approved_facts.filter((_, j) => j !== i) })}
                            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        {f.evidence && (
                          <p className="mt-1.5 flex gap-1.5 pl-6 text-xs text-muted-foreground">
                            <Quote className="size-3 shrink-0" aria-hidden /> <span className="italic">{f.evidence}</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {draft.rejected_facts.length > 0 && (
                    <div className="rounded-xl bg-warning-soft p-3 text-sm">
                      <p className="flex items-center gap-1.5 font-medium text-warning">
                        <TriangleAlert className="size-4" /> {draft.rejected_facts.length} claim{draft.rejected_facts.length > 1 ? "s" : ""} dropped: evidence not found in the record
                      </p>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-foreground/75">
                        {draft.rejected_facts.map((f, i) => (
                          <li key={i}>{f.fact}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </m.div>

              <m.div variants={item}>
                <Card className="gap-4 p-6">
                  <CardHeader className="px-0">
                    <CardTitle>Pre-screen questions</CardTitle>
                    <CardDescription>Asked in order. The backend scores answers; the research team makes the final call.</CardDescription>
                  </CardHeader>
                  <ol className="space-y-3">
                    {c.prescreen_questions.map((q, i) => (
                      <li key={q.id} className="space-y-2 rounded-xl border p-3">
                        <div className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-full bg-muted font-mono text-xs">{i + 1}</span>
                          {q.kind === "number" ? (
                            <Badge variant="outline" className="rounded-full font-normal">
                              Age {q.min != null ? `≥ ${q.min}` : ""}
                              {q.max != null ? ` ≤ ${q.max}` : ""}
                            </Badge>
                          ) : (
                            <Select
                              value={q.role}
                              onValueChange={(role) =>
                                update({ prescreen_questions: c.prescreen_questions.map((x, j) => (j === i ? { ...x, role } : x)) })
                              }
                            >
                              <SelectTrigger size="sm" className="h-7 w-40 text-xs" aria-label="Scoring">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_LABEL).map(([v, l]) => (
                                  <SelectItem key={v} value={v}>
                                    {l}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <button
                            aria-label="Remove question"
                            onClick={() => update({ prescreen_questions: c.prescreen_questions.filter((_, j) => j !== i) })}
                            className="ml-auto text-muted-foreground hover:text-foreground"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <Textarea
                          value={q.ask}
                          onChange={(e) =>
                            update({ prescreen_questions: c.prescreen_questions.map((x, j) => (j === i ? { ...x, ask: e.target.value } : x)) })
                          }
                          className="min-h-14 text-sm"
                          aria-label={`Question ${i + 1}`}
                        />
                        {q.criterion && <p className={cn("text-xs text-muted-foreground")}>Criterion: {q.criterion}</p>}
                      </li>
                    ))}
                  </ol>
                </Card>
              </m.div>
            </div>

            <m.div variants={item}>
              {approved ? (
                <div className="space-y-4">
                  <Card className="flex-row items-center gap-3 bg-good-soft p-5 ring-0">
                    <Check className="size-5 text-good" />
                    <p className="text-sm">
                      <span className="font-medium">Approved.</span> It&apos;s now the active campaign on the Overview page.
                    </p>
                  </Card>
                  <TestCall campaignId={approved} />
                </div>
              ) : (
                <Card className="flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
                  <CardContent className="px-0 text-sm text-muted-foreground">
                    Approving publishes this script for new opt-ins. Wording stays labeled as not IRB-approved.
                  </CardContent>
                  <Button onClick={approve} disabled={saving} size="lg" className="gap-2 bg-brand hover:bg-brand-strong">
                    {saving ? <Loader2 className="animate-spin" /> : null} Approve campaign <ArrowRight />
                  </Button>
                </Card>
              )}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
