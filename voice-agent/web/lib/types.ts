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
