import type { LeadStatus, LeadSummary } from "./types"

export const parseTime = (iso?: string | null) => (iso ? new Date(iso) : null)

const isToday = (d: Date) => d.toDateString() === new Date().toDateString()

export function formatTime(iso?: string | null, seconds = false) {
  const d = parseTime(iso)
  if (!d) return "—"
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) })
  return isToday(d) ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${t}`
}

export function timeAgo(iso?: string | null) {
  const d = parseTime(iso)
  if (!d) return ""
  const m = Math.round((Date.now() - d.getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

export function formatSeconds(s: number | null | undefined) {
  if (s == null) return "—"
  if (s < 1) return "<1s"
  if (s < 90) return `${Math.round(s)}s`
  if (s < 5400) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

export const formatDuration = (s?: number | null) =>
  s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

export function formatPhone(p: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export const displayName = (l: Pick<LeadSummary, "first_name" | "last_name">) =>
  `${cap(l.first_name)}${l.last_name ? ` ${cap(l.last_name)}` : ""}`

export const initials = (l: Pick<LeadSummary, "first_name" | "last_name">) =>
  `${l.first_name?.[0] ?? ""}${l.last_name?.[0] ?? ""}`.toUpperCase() || "?"

export const sourceLabel = (s: string) =>
  ({ demo_form: "Ad opt-in form", web_form: "Web form", mock: "Mock call", text_test: "Text test", browser_test: "Browser test", simulation: "Text simulation", scorecard: "Scorecard" })[s] ??
  s

export function formatVisit(local: string) {
  return new Date(local).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

/** Status presentation. Colors validated for color-vision deficiency; every use pairs color with a label. */
export const STATUS: Record<LeadStatus, { label: string; tone: Tone }> = {
  booked: { label: "Booked", tone: "good" },
  calling: { label: "On call", tone: "live" },
  needs_human: { label: "Needs a human", tone: "warning" },
  emergency: { label: "Emergency", tone: "critical" },
  no_answer: { label: "No answer", tone: "info" },
  queued: { label: "Queued", tone: "info" },
  not_a_fit: { label: "Not a fit", tone: "neutral" },
  opted_out: { label: "Opted out", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
  new: { label: "New", tone: "neutral" },
}

export type Tone = "good" | "live" | "warning" | "critical" | "info" | "neutral"

/** Outcome groups for the breakdown bar, in display order. */
export const OUTCOME_GROUPS: { id: string; label: string; color: string; statuses: LeadStatus[] }[] = [
  { id: "booked", label: "Booked", color: "#059669", statuses: ["booked"] },
  { id: "attention", label: "Needs a human", color: "#f59e0b", statuses: ["needs_human"] },
  { id: "emergency", label: "Emergency", color: "#dc2626", statuses: ["emergency"] },
  { id: "progress", label: "In progress", color: "#3b82f6", statuses: ["calling", "queued", "no_answer", "new"] },
  { id: "not_fit", label: "Not a fit", color: "#a1a1aa", statuses: ["not_a_fit"] },
  { id: "closed", label: "Opted out / closed", color: "#d4d4d8", statuses: ["opted_out", "closed"] },
]
