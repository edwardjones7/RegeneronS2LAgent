"use client"

import { CalendarDays, ClipboardCheck, ExternalLink, FlaskConical, LayoutDashboard, LogOut, Play, Plus } from "lucide-react"
import { LazyMotion, MotionConfig, domAnimation } from "motion/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "sonner"

import { BrandLockup } from "@/components/brand"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthError, api, post } from "@/lib/api"
import type { Campaign, Persona } from "@/lib/types"
import { cn } from "@/lib/utils"

type Ctx = { campaigns: Campaign[] | null; campaignId: string | null; setCampaignId: (id: string) => void }
const CampaignContext = createContext<Ctx>({ campaigns: null, campaignId: null, setCampaignId: () => {} })
export const useCampaign = () => useContext(CampaignContext)

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/scorecard", label: "Scorecard", icon: ClipboardCheck },
  { href: "/campaigns/new", label: "New campaign", icon: Plus },
]

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

function DemoMenu() {
  const router = useRouter()
  const [personas, setPersonas] = useState<Persona[]>([])
  const load = () => personas.length === 0 && api<Persona[]>("/simulate/personas").then(setPersonas).catch(() => {})
  const run = async (p: Persona) => {
    try {
      await post(`/simulate/${p.id}`)
      toast.success(`Scenario started: ${p.label}`, { description: "Ava is talking to a simulated patient. Watch it live." })
      router.push("/")
    } catch (e) {
      toast.error("Couldn't start the scenario", { description: (e as Error).message })
    }
  }
  return (
    <DropdownMenu onOpenChange={(o) => o && load()}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Play className="size-3.5" aria-hidden /> <span className="hidden md:inline">Run scenario</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Ava talks to a scripted patient (text mode, real agent and tools)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {personas.length === 0 && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
        {personas.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => run(p)} className="flex-col items-start gap-0.5 py-2">
            <span className="font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground">{p.brief}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const ctx = useCampaigns()
  const pathname = usePathname()
  return (
    <CampaignContext.Provider value={ctx}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <TooltipProvider delayDuration={150}>
            <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
              <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
                <BrandLockup suffix="Coordinator" />
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
                  {ctx.campaigns && ctx.campaigns.length > 1 && (
                    <Select value={ctx.campaignId ?? undefined} onValueChange={ctx.setCampaignId}>
                      <SelectTrigger size="sm" className="hidden w-52 md:flex" aria-label="Campaign">
                        <FlaskConical className="size-3.5 text-muted-foreground" aria-hidden />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {ctx.campaigns.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.study.charAt(0).toUpperCase() + c.study.slice(1)} · {c.nct_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <DemoMenu />
                  <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                    <a href="/demo" target="_blank" rel="noopener">
                      Opt-in form <ExternalLink aria-hidden />
                    </a>
                  </Button>
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
    </CampaignContext.Provider>
  )
}
