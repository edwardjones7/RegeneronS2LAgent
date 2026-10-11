import type { Metadata } from "next"

import { AppShell } from "@/components/app-shell"
import { InboxView } from "@/components/outreach/inbox-view"

export const metadata: Metadata = { title: "Inbox · Trialist" }

export default function Page() {
  return (
    <AppShell>
      <InboxView />
    </AppShell>
  )
}
