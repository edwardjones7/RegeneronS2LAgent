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

export type Flag = { type: string; detail: string; at: string }

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
  reached: number
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
      at: string
    }[]
  }
  calls: CallRecord[]
  events: { at: string; type: string; detail: Record<string, unknown> }[]
}
