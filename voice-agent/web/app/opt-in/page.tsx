import type { Metadata } from "next"
import { CalendarDays, Check, ExternalLink, FlaskConical, Shuffle } from "lucide-react"

import { RegeneronLogo } from "@/components/brand"
import { Badge } from "@/components/ui/badge"

import { OptInForm } from "./opt-in-form"

export const metadata: Metadata = {
  title: "Weight management research study",
  description: "Adults living with overweight or obesity, without diabetes, may be able to take part in a research study.",
}

// Facts come from the public ClinicalTrials.gov record (NCT07685808) used by the demo campaign.
const FACTS = [
  { icon: FlaskConical, title: "Experimental medication", text: "A Phase 2 study of olatorepatide, in the GLP-1 and GIP family of medicines." },
  { icon: CalendarDays, title: "About 60 weeks", text: "Participation lasts a little over a year, starting with a screening visit." },
  { icon: Shuffle, title: "Placebo-controlled", text: "Some participants receive an inactive look-alike instead, assigned by chance." },
]

export default function OptInPage() {
  return (
    <div className="min-h-svh bg-[radial-gradient(70%_45%_at_50%_0%,oklch(0.95_0.025_250),transparent)]">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <RegeneronLogo priority />
        <span className="h-6 w-px bg-border" aria-hidden />
        <span className="text-sm font-medium text-muted-foreground">Clinical research</span>
        <Badge variant="outline" className="ml-auto h-7 rounded-full bg-background/60 px-3 font-normal text-muted-foreground">
          Demo · not IRB-approved
        </Badge>
      </header>

      <main className="mx-auto grid max-w-6xl items-start gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:pt-16">
        <section className="animate-in duration-500 fade-in slide-in-from-bottom-2">
          <Badge className="h-7 gap-1.5 rounded-full bg-brand-soft px-3 text-brand">
            <span className="size-1.5 rounded-full bg-current" aria-hidden /> Now enrolling
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A research study for adults living with overweight or obesity
          </h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
            If you&apos;re 18 or older and don&apos;t have diabetes, you may be able to take part in a study of an experimental
            weight-management medication.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {FACTS.map((f) => (
              <li key={f.title} className="rounded-xl bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-foreground/10">
                <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground/70">
                  <f.icon className="size-4" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-medium">{f.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>

          <ul className="mt-8 space-y-2.5 text-sm text-muted-foreground">
            {["Taking part is voluntary, and you can stop at any time", "The first screening visit is free (demo detail)", "The research team confirms whether the study is a good fit"].map(
              (t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="grid size-5 place-items-center rounded-full bg-good-soft text-good">
                    <Check className="size-3" aria-hidden />
                  </span>
                  {t}
                </li>
              )
            )}
          </ul>

          <a
            href="https://clinicaltrials.gov/study/NCT07685808"
            target="_blank"
            rel="noopener"
            className="mt-8 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            NCT07685808 on ClinicalTrials.gov <ExternalLink className="size-3" aria-hidden />
          </a>
        </section>

        <section className="animate-in delay-100 duration-500 fill-mode-backwards fade-in slide-in-from-bottom-2 lg:sticky lg:top-8">
          <OptInForm />
        </section>
      </main>
    </div>
  )
}
