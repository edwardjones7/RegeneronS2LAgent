import type { Metadata } from "next"

import { AppShell } from "@/components/app-shell"
import { CalendarView } from "@/components/pages/calendar-view"

export const metadata: Metadata = { title: "Calendar · Trialist" }

export default function Page() {
  return (
    <AppShell>
      <CalendarView />
    </AppShell>
  )
}
