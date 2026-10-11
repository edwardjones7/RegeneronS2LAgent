import type { Metadata } from "next"

import { AppShell } from "@/components/app-shell"
import { ScorecardView } from "@/components/pages/scorecard-view"

export const metadata: Metadata = { title: "Scorecard · Trialist" }

export default function Page() {
  return (
    <AppShell>
      <ScorecardView />
    </AppShell>
  )
}
