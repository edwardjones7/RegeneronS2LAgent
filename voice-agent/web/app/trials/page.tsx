import type { Metadata } from "next"

import { AppShell } from "@/components/app-shell"
import { TrialsView } from "@/components/outreach/trials-view"

export const metadata: Metadata = { title: "Trials · Trialist" }

export default function Page() {
  return (
    <AppShell>
      <TrialsView />
    </AppShell>
  )
}
