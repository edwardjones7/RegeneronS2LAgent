import type { Metadata } from "next"

import { AppShell } from "@/components/app-shell"
import { NewCampaignView } from "@/components/pages/new-campaign-view"

export const metadata: Metadata = { title: "New campaign · Call Me Maybe" }

export default function Page() {
  return (
    <AppShell>
      <NewCampaignView />
    </AppShell>
  )
}
