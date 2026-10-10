"use client"

import { ChevronRight, Inbox, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNow } from "@/hooks/use-url"
import { displayName, formatPhone, formatSeconds, formatTime, initials, parseTime, sourceLabel } from "@/lib/format"
import type { LeadStatus, LeadSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

import { StatusBadge } from "./status-badge"

const FILTERS: { id: string; label: string; statuses?: LeadStatus[] }[] = [
  { id: "all", label: "All" },
  { id: "booked", label: "Booked", statuses: ["booked"] },
  { id: "attention", label: "Needs attention", statuses: ["needs_human", "emergency"] },
  { id: "progress", label: "In progress", statuses: ["calling", "queued", "no_answer", "new"] },
  { id: "closed", label: "Closed", statuses: ["not_a_fit", "opted_out", "closed"] },
]

export function LeadsTable({
  leads,
  selectedId,
  onSelect,
}: {
  leads: LeadSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const now = useNow(5000)
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, f.statuses ? leads.filter((l) => f.statuses!.includes(l.status)).length : leads.length])),
    [leads]
  )
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    return leads.filter(
      (l) =>
        (!f?.statuses || f.statuses.includes(l.status)) &&
        (!q || `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) || (qDigits.length > 2 && l.phone.includes(qDigits)))
    )
  }, [leads, filter, query])

  return (
    <Card className="gap-0 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Leads</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="h-8">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.id} value={f.id} className="gap-1.5 px-2.5 text-xs">
                  {f.label}
                  <span className="text-muted-foreground tabular">{counts[f.id]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone"
              aria-label="Search leads"
              className="h-8 w-full pl-8 text-sm sm:w-52"
            />
          </div>
        </div>
      </CardHeader>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium">{leads.length ? "No leads match" : "No leads yet"}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {leads.length ? "Try another filter or search." : "When someone opts in from an ad, they'll show up here within seconds."}
            </p>
          </div>
          {!leads.length && (
            <Button asChild variant="outline" size="sm">
              <a href="/demo" target="_blank" rel="noopener">
                Open the opt-in form
              </a>
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Lead</TableHead>
              <TableHead className="hidden md:table-cell">Opted in</TableHead>
              <TableHead>Ringing in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-8 pr-4" aria-label="Open" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow
                key={l.id}
                data-state={l.id === selectedId ? "selected" : undefined}
                className={cn(
                  "group cursor-pointer",
                  now - (parseTime(l.created_at)?.getTime() ?? 0) < 15000 && "animate-in bg-brand-soft/50 duration-500 fade-in slide-in-from-top-1"
                )}
                tabIndex={0}
                onClick={() => onSelect(l.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect(l.id)
                  }
                }}
              >
                <TableCell className="py-3 pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-medium">{initials(l)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{displayName(l)}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {sourceLabel(l.source)} · {formatPhone(l.phone)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{formatTime(l.created_at)}</TableCell>
                <TableCell
                  className={cn(
                    "font-mono text-xs",
                    (l.seconds_to_ring ?? l.seconds_to_first_call ?? 999) <= 60 ? "text-good" : "text-muted-foreground"
                  )}
                >
                  {l.seconds_to_ring != null ? `${l.seconds_to_ring.toFixed(1)}s` : formatSeconds(l.seconds_to_first_call)}
                </TableCell>
                <TableCell>
                  <StatusBadge lead={l} />
                </TableCell>
                <TableCell className="pr-4">
                  <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
