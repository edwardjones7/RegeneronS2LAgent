export type LeadStatus =
  | "new"
  | "queued"
  | "calling"
  | "booked"
  | "not_a_fit"
  | "no_answer"
  | "needs_human"
  | "opted_out"
  | "emergency"
  | "closed"
  | "chart_review"
  | "dropped"

export type Flag = { type: string; detail: string; at: string; resolved?: boolean }

export type LeadSummary = {
  id: number
  first_name: string
  last_name: string
  phone: string
  source: string
  status: LeadStatus
  status_reason: string
  flags: Flag[]
  attempts: number
  created_at: string
  seconds_to_first_call: number | null
  seconds_to_ring: number | null
  next_attempt_at: string | null
}

export type Campaign = { id: string; study: string; nct_id: string }

export type Overview = {
  campaign: {
    id: string
    study_short_name: string
    nct_id: string
    study_url: string
    team_name: string
    coordinator_name: string
    calling_hours: { start: string; end: string }
    timezone: string
    demo_not_irb_approved: boolean
  }
  total_leads: number
  by_status: Partial<Record<LeadStatus, number>>
  median_seconds_to_first_call: number | null
  median_seconds_to_ring: number | null
  reached: number
  funnel: Funnel
  needs_attention: LeadSummary[]
}

export type TranscriptTurn = {
  role: "agent" | "user"
  message: string | null
  time_in_call_secs: number | null
  tool_calls?: string[]
}

export type CallRecord = {
  id: number
  attempt_no: number
  conversation_id: string | null
  started_at: string
  ended_at: string | null
  duration_secs: number | null
  outcome: string | null
  summary: string
  transcript: TranscriptTurn[]
  recording_url: string | null
}

export type LeadDetail = LeadSummary & {
  campaign_id: string
  consent: { given: boolean; text: string; at: string }
  visit: { slot_id: number; starts_at_local: string } | null
  screening: {
    state: "in_progress" | "fit" | "not_a_fit" | "needs_review"
    reason: string
    bmi: number | null
    flags: string[]
    answers: {
      question_id: string
      question: string
      answer: string
      normalized: string
      verdict: "fit" | "disqualify" | "unsure" | "info"
      criterion: string | null
      at: string
    }[]
  }
  calls: CallRecord[]
  events: { at: string; type: string; detail: Record<string, unknown> }[]
  notes: { at: string; text: string }[]
}

export type Funnel = { opted_in: number; reached: number; screened: number; looked_like_fit: number; booked: number }

export type LiveCall = {
  call_id: number
  lead_id: number
  first_name: string
  last_name: string
  phone: string
  source: string
  status: LeadStatus
  phase: "dialing" | "ringing" | "in_progress" | "ending" | "ended"
  telephony_status: string | null
  opt_in_at: string
  placed_at: string
  ringing_at: string | null
  answered_at: string | null
  ended_at: string | null
  seconds_to_place: number | null
  seconds_to_ring: number | null
  seconds_to_answer: number | null
  answered: number
  total: number
  current_question: { id: string; ask: string } | null
  screening_state: string
  transcript: TranscriptTurn[]
}

export type Persona = { id: string; label: string; brief: string }

export type ScorecardResult = {
  persona: string
  label: string
  brief: string
  lead_id?: number
  status?: string
  passed: boolean
  checks: { check: string; pass: boolean; detail: string }[]
}

export type ScorecardRun = { id: number; status: "running" | "done"; started_at: string; finished_at: string | null; results: ScorecardResult[] }

export type Visit = { slot_id: number; starts_at_local: string; lead_id: number; first_name: string; last_name: string; phone: string; status: LeadStatus }

export type OpenSlot = { id: number; starts_at_local: string; label: string }

export type CampaignDraft = {
  campaign: {
    id: string
    nct_id: string
    study_url: string
    sponsor: string
    study_short_name: string
    one_liner: string
    approved_facts: { fact: string; source: string; evidence?: string }[]
    prescreen_questions: { id: string; kind: string; ask: string; role: string; min?: number; max?: number; criterion?: string }[]
    [key: string]: unknown
  }
  rejected_facts: { fact: string; evidence: string }[]
  study: { nct_id: string; title: string; sponsor: string; status: string; conditions: string[]; phases: string[] }
  model: string
}

// ---- Practice outreach (a doctor's office calling its own pre-screened patients)

export type Practice = { id: string; name: string; patients: number | null }

export type PracticeProfile = {
  practice_id: string
  name: string
  doctor_name: string
  address: string
  callback_phone: string
  staff_phone: string
  timezone: string
  office_display: string
}

export type TrialCard = {
  nct_id: string
  title: string
  official_title: string
  sponsor: string
  phase: string
  url: string
  callable: boolean
  candidates: number
  chart_review: number
  accepted: boolean
  acceptance_id: number | null
  accepted_by: string | null
  accepted_at: string | null
}

export type OutreachRow = LeadSummary & {
  practice_id: string
  nct_id: string | null
  simulated: boolean
  identity_verified: boolean
  call_window: string | null
  last_activity: { type: string; at: string } | null
  texts: number
  inbound_calls: number
}

export type OutreachOverview = {
  practice: PracticeProfile
  totals: {
    patients: number
    called: number
    reached: number
    texted: number
    booked: number
    needs_staff: number
    chart_review: number
    in_progress: number
  }
  by_status: Partial<Record<LeadStatus, number>>
  patients: OutreachRow[]
}

export type InboxMessage = { id: number; at: string; channel: "call" | "sms"; from_phone: string; name: string; text: string; resolved: boolean }
