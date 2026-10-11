"use client"

import { Building2, CalendarDays, ClipboardCheck, FlaskConical, Inbox, LogOut, PhoneOutgoing } from "lucide-react"
import { LazyMotion, MotionConfig, domAnimation } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "sonner"

import { BrandLockup } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthError, api } from "@/lib/api"
import type { Campaign, Practice } from "@/lib/types"
import { cn } from "@/lib/utils"

type Ctx = { campaigns: Campaign[] | null; campaignId: string | null; setCampaignId: (id: string) => void }
const CampaignContext = createContext<Ctx>({ campaigns: null, campaignId: null, setCampaignId: () => {} })
export const useCampaign = () => useContext(CampaignContext)

const NAV = [
  { href: "/", label: "Outreach", icon: PhoneOutgoing },
  { href: "/trials", label: "Trials", icon: FlaskConical },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/scorecard", label: "Scorecard", icon: ClipboardCheck },
]

// ---- Practice: every outreach screen is scoped to one practice.

type PracticeCtx = { practices: Practice[] | null; practiceId: string | null; setPracticeId: (id: string) => void }
const PracticeContext = createContext<PracticeCtx>({ practices: null, practiceId: null, setPracticeId: () => {} })
export const usePractice = () => useContext(PracticeContext)

const PRACTICE_KEY = "cmm.practice"

function usePractices(): PracticeCtx {
  const [practices, setPractices] = useState<Practice[] | null>(null)
  const [practiceId, setId] = useState<string | null>(null)
  useEffect(() => {
    api<Practice[]>("/practices")
      .then((list) => {
        setPractices(list)
        let saved: string | null = null
        try {
          saved = localStorage.getItem(PRACTICE_KEY)
        } catch {}
        // Default to the biggest practice: the demo's doctor view.
        const biggest = [...list].sort((a, b) => (b.patients ?? 0) - (a.patients ?? 0))[0]
        setId(list.find((p) => p.id === saved)?.id ?? biggest?.id ?? null)
      })
      .catch((e) => !(e instanceof AuthError) && toast.error("Couldn't load practices"))
  }, [])
  const setPracticeId = (id: string) => {
    setId(id)
    try {
      localStorage.setItem(PRACTICE_KEY, id)
    } catch {}
  }
  return { practices, practiceId, setPracticeId }
}

const STORAGE_KEY = "cmm.campaign"

function useCampaigns(): Ctx {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [campaignId, setId] = useState<string | null>(null)
  useEffect(() => {
    api<Campaign[]>("/campaigns")
      .then((list) => {
        setCampaigns(list)
        let saved: string | null = null
        try {
          saved = localStorage.getItem(STORAGE_KEY)
        } catch {}
        setId(list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? null)
      })
      .catch((e) => !(e instanceof AuthError) && toast.error("Couldn't load campaigns"))
  }, [])
  const setCampaignId = (id: string) => {
    setId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {}
  }
  return { campaigns, campaignId, setCampaignId }
}

export function AppShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const ctx = useCampaigns()
  const practice = usePractices()
  const pathname = usePathname()
  return (
    <CampaignContext.Provider value={ctx}>
     <PracticeContext.Provider value={practice}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <TooltipProvider delayDuration={150}>
            <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
              <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
                <BrandLockup suffix="Office" />
                <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
                  {NAV.map((n) => {
                    const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors",
                          active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <n.icon className="size-3.5" aria-hidden />
                        {n.label}
                      </Link>
                    )
                  })}
                </nav>
                <div className="ml-auto flex items-center gap-2">
                  {actions}
                  {practice.practices && (
                    <Select value={practice.practiceId ?? undefined} onValueChange={practice.setPracticeId}>
                      <SelectTrigger size="sm" className="w-44 sm:w-56" aria-label="Practice">
                        <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
                        <SelectValue placeholder="Practice" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {practice.practices.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            <span className="ml-auto pl-3 text-xs text-muted-foreground tabular">{p.patients ?? "<5"}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <form method="post" action="/auth/logout">
                    <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                      <LogOut aria-hidden />
                    </Button>
                  </form>
                </div>
              </div>
              <nav className="flex gap-1 overflow-x-auto border-t px-4 py-1.5 lg:hidden" aria-label="Main">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm",
                      (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ? "bg-muted font-medium" : "text-muted-foreground"
                    )}
                  >
                    <n.icon className="size-3.5" aria-hidden />
                    {n.label}
                  </Link>
                ))}
              </nav>
            </header>
            <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">{children}</main>
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </LazyMotion>
      </MotionConfig>
     </PracticeContext.Provider>
    </CampaignContext.Provider>
  )
}
