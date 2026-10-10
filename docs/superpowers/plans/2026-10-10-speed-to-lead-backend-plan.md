# Speed-to-Lead Voice Agent — Backend Build Plan

Design: `docs/superpowers/specs/2026-10-10-speed-to-lead-agent-design.md` (read it first; this plan does not repeat the why).
Scope: backend only (no dashboard UI). Stack: Python 3.12, FastAPI, SQLite + SQLAlchemy, ElevenLabs Agents, Twilio.

**Ordering rule:** every milestone ends in something demoable. If time runs out after any milestone, what exists still works.

| Milestone | Ends with |
|---|---|
| M0 Spike | A real ElevenLabs outbound call to a teammate's phone from a script; API shapes confirmed |
| M1 Core logic | Screening, BMI, calling hours, calendar: all unit-tested, no network |
| M2 Happy path | `POST /leads` → real call → questions → booking → both SMS → stored record |
| M3 Safety outcomes | Not a fit, opt-out, emergency, medical question, human request, language |
| M4 Reliability | No answer/voicemail, retries in calling hours, queued leads, live transfer |
| M5 Clean-clone + demo | Setup script, mock mode, README, persona test run, sources cited |

---

## M0 — Spike: confirm the ElevenLabs + Twilio wiring (throwaway, ~1 hr)

The ElevenLabs API changes often. Confirm the exact shapes before building on them, and write what you find into `docs/notes/elevenlabs-api.md`.

1. Create the Twilio trial account, buy one number, and verify every teammate phone that will be called or texted.
2. In ElevenLabs: create a bare agent (first message only). Import the Twilio number (`POST /v1/convai/phone-numbers`, provider `twilio`) and note the `phone_number_id`.
3. Place one call: `POST /v1/convai/twilio/outbound-call` with `agent_id`, `agent_phone_number_id`, `to_number`, and `conversation_initiation_client_data.dynamic_variables = {first_name, lead_id}`. Confirm that `{{first_name}}` renders in the first message.
4. Confirm and record:
   - What the outbound-call response returns (`conversation_id`? `callSid`?). We key calls on it.
   - How a **server (webhook) tool** is defined: inline in `conversation_config.agent.prompt.tools` or via `/v1/convai/tools` + `tool_ids`; how to pass a static auth header; whether a dynamic variable (`{{lead_id}}`) can be injected into tool params.
   - The **post-call webhook** payload (`post_call_transcription`): where the transcript, summary, conversation_id and dynamic variables live; how the HMAC signature header is verified; whether the webhook URL can be set by API or only in the dashboard.
   - What happens on **no answer / busy / failed** (is there a `call_initiation_failure` webhook?) and on **voicemail** (the `voicemail_detection` system tool).
   - The **`transfer_to_number`** system tool for live transfer.
   - Which **Claude** models are in the agent's LLM list (pick the newest Claude available).
   - How to fetch the recording (`GET /v1/convai/conversations/{id}/audio`).
5. Expose localhost with ngrok and confirm ElevenLabs can reach a dummy tool endpoint mid-call.

**Exit:** a teammate's phone rings, Ava says their name, and `docs/notes/elevenlabs-api.md` has the confirmed shapes. If any assumption below is wrong, adjust the plan before M2.

---

## M1 — Project skeleton + core logic (TDD, no network)

### Task 1.1 — Skeleton
- `pyproject.toml` (uv): fastapi, uvicorn, sqlalchemy, pydantic-settings, pyyaml, httpx, twilio, elevenlabs, pytest, freezegun.
- Layout:
  ```
  app/
    main.py            FastAPI app + router wiring + background worker startup
    config.py          Settings from .env (MOCK_MODE, keys, PUBLIC_BASE_URL, TOOL_SECRET, READ_API_KEY)
    db.py, models.py   SQLAlchemy engine/session + tables
    campaigns.py       load + validate campaign YAML (pydantic)
    screening.py       answer scoring, BMI, fit decision
    hours.py           calling-hours + retry-time math
    slots.py           mock coordinator calendar
    prompt.py          render the agent system prompt from a campaign
    voice.py           VoiceClient protocol: ElevenLabsVoice + MockVoice
    sms.py             SmsClient protocol: TwilioSms + MockSms (logs + stores)
    outcomes.py        apply a call outcome: status, events, SMS, retries
    routes/leads.py, routes/tools.py, routes/webhooks.py, routes/read_api.py
  campaigns/olatorepatide-nct07685808.yaml
  scripts/  fetch_study.py, setup_elevenlabs.py, submit_lead.py, mock_call.py, seed.py
  tests/
  ```
- `.env.example` with every variable, plus `MOCK_MODE=true` as the default.

### Task 1.2 — Data model (`models.py`)
Tables: `site`, `campaign`, `lead` (name, phone E.164, timezone nullable, source, consent_given, consent_text, consent_at, status, campaign_id), `call` (lead_id, provider_conversation_id, attempt_no, started_at, connected_at, ended_at, outcome, summary, transcript JSON, recording_url), `answer` (lead_id, question_id, raw_text, normalized_value, verdict: fit|disqualify|unsure|na), `slot` (campaign_id, starts_at, booked_lead_id nullable), `event` (lead_id, at, type, detail JSON), `suppression` (phone, reason, at).
Lead statuses: `new, queued, calling, booked, not_a_fit, no_answer, needs_human, opted_out, emergency, closed`.
Tests: model round-trip; suppression lookup by normalized phone.

### Task 1.3 — Campaign file + loader
- `scripts/fetch_study.py NCT07685808` pulls the record from the ClinicalTrials.gov v2 API and saves the raw JSON to `campaigns/sources/` (for citation and evidence).
- Hand-write `campaigns/olatorepatide-nct07685808.yaml`: `clinic_name: Regeneron`, demo phone and address, coordinator name + phone, `timezone`, `calling_hours: {start: "09:00", end: "20:00"}`, `study_short_name`, `one_liner`, `approved_facts` (list, each with a `source:` of `ctgov` or `demo`), `prescreen_questions` (from design §9: id, ask, type `yes_no|number|height|weight`, `rule`), `demo_not_irb_approved: true`, `nct_id`.
- Pydantic validation; a test that the shipped file loads and has every required field.

### Task 1.4 — Screening (`screening.py`)
- `score_answer(question, raw)` → verdict. Yes/no with "not sure" → `unsure`.
- `bmi(height_in, weight_lb)`; height parsing accepts "5 foot 7", "5'7", "67 inches", "170 cm".
- `decide(answers, campaign)` → `{state: in_progress|fit|not_a_fit, reason, may_offer_slots: bool, flags: [...]}`. A hard disqualifier → `not_a_fit` immediately. BMI rule: 30–<45 fits; 27–<30 needs a "yes" on the comorbidity question; otherwise not a fit. A question still unanswered blocks `fit`, except ones answered `unsure` (flagged).
- Tests: a table of cases covering every rule, plus a BMI boundary at 27/30/45, plus an "unsure family history" flag.

### Task 1.5 — Calling hours (`hours.py`)
- `lead_tz(lead, campaign)`; `can_call_now(lead, campaign, now)`; `next_window(lead, campaign, now)`; `retry_at(attempt_no, now, ...)`: attempt 2 ≈ +2h, attempt 3 ≈ next day mid-morning, always clamped into the window. Max 3 attempts total.
- Tests with freezegun across the window edges and a lead in a different timezone.

### Task 1.6 — Mock calendar (`slots.py`)
- Seed ~10 slots over the next 5 business days. `open_slots(campaign, n=3)` returns the soonest. `book(slot_id, lead_id)` is atomic (it fails if already taken).
- Tests: a double-booking is refused.

---

## M2 — Happy path, end to end

### Task 2.1 — `POST /leads` (`routes/leads.py`)
Body: name, phone, campaign_id, consent_given, consent_text, source, timezone?.
Order: validate → normalize phone → reject if `consent_given` is false (400) → if suppressed: store as `opted_out`, don't call → if outside hours: `queued` with `next_attempt_at` → else create a `call` row and `voice.start_call(lead)` **in a background task**, so the HTTP response returns immediately. Record events `lead_received` and `call_started` with timestamps (the dashboard's "time to first call" comes from these).
Tests: each branch, with MockVoice asserting whether it was called.

### Task 2.2 — Agent prompt (`prompt.py`)
Render from the campaign: role, the **mandatory opening** (as the agent's `first_message` with `{{first_name}}`), the one-liner, the rule "answer study questions ONLY from these facts; otherwise say the research team will follow up", the questions in order (call `record_answer` after each), "call `check_fit` / `get_open_slots` only when allowed", the booking wording ("the research team will confirm eligibility at your visit", never "you qualify"), emergency / opt-out / human / medical-question / language rules with the exact tool to call for each, and tone. A snapshot test of the rendered prompt.

### Task 2.3 — Tool endpoints (`routes/tools.py`)
All endpoints require the `X-Tool-Secret` header; `lead_id` comes in from the dynamic variable.
- `POST /tools/record_answer {lead_id, question_id, answer}` → stores it, returns `{verdict, decision}` (so Ava knows whether to end early).
- `POST /tools/get_open_slots {lead_id}` → 403-style refusal message unless `decide().may_offer_slots`; else 2–3 slots with spoken-friendly labels ("Thursday October 16th at 10 AM").
- `POST /tools/book_visit {lead_id, slot_id}` → books, sets status `booked`, logs an event, and **sends both SMS right away** (don't wait for the post-call webhook, so texts land before the call ends). Idempotent.
- `opt_out`, `escalate_to_human {reason}`, `flag_emergency {what_was_said}` → status + event (+ coordinator SMS for emergency/human; design leaves it to the builder, and we're doing it).
- Responses are short plain sentences Ava can act on.
Tests: the fit gate on slots/booking, idempotent booking, a bad secret → 401.

### Task 2.4 — SMS (`sms.py`)
Templates from design §7 rendered from the campaign. The patient SMS only from `book_visit`. TwilioSms sends from the Twilio number; MockSms appends to the `event` table and prints. Tests: template rendering; no patient SMS for any non-booked status.

### Task 2.5 — Post-call webhook (`routes/webhooks.py`)
Verify the HMAC signature. Find the `call` by conversation_id. Store the transcript, the summary, `connected_at`/`ended_at`, and the recording URL (or fetch the audio and store it locally). If the lead is still `calling` with no other outcome → `closed` with reason "ended without outcome" + flag for review. **Never** send the patient SMS from here (booking already did).
Tests: a fixture payload from the M0 notes; a bad signature is rejected; idempotent on repeat delivery.

### Task 2.6 — ElevenLabs setup script (`scripts/setup_elevenlabs.py`)
Idempotent: create or update the agent (prompt, first message, voice, LLM, server tools pointing at `PUBLIC_BASE_URL`, system tools `end_call`, `transfer_to_number`, `voicemail_detection`), link the imported number, and set the post-call webhook if the API allows it (else print the exact URL to paste in the dashboard). Writes `ELEVENLABS_AGENT_ID` / `ELEVENLABS_PHONE_NUMBER_ID` to `.env`. Re-run after the ngrok URL changes.

### Task 2.7 — Demo lead submitter
`scripts/submit_lead.py --name Sarah --phone +1... ` and a tiny static `demo/form.html` served at `/demo` (name, phone, consent checkbox with the consent text). It shows the ad → form → phone-rings moment.

**M2 exit (manual):** submit the form → a teammate's phone rings in under 45s → the full interested-persona call → booked → both texts arrive → `GET /leads/{id}` shows the answers, transcript and timeline.

---

## M3 — Safety outcomes

For each, add it to the prompt (if needed), the tool behavior and `outcomes.py`, a unit test on the backend state change, and a scripted persona check (M5):

1. **Not a fit:** `record_answer` returns `not_a_fit` → Ava closes warmly ("we'll keep your info on file"), no SMS.
2. **Opt-out:** `opt_out` → suppression row + status; a later `POST /leads` with the same phone (any campaign) never dials.
3. **Emergency:** `flag_emergency` → status `emergency`, coordinator SMS, the prompt forces "hang up and call 911" and `end_call`. A prompt test confirms that the emergency rule comes before everything else.
4. **Medical question:** no tool needed to answer; `escalate_to_human(reason="medical question: …")` flags it while the call continues.
5. **Wants a human:** `transfer_to_number` to the coordinator (M4 makes it live); for now `escalate_to_human` + `needs_human`.
6. **Non-English / repeated confusion:** `escalate_to_human` with reason `language` / `confusion`.

---

## M4 — Reliability

1. **No answer / voicemail:** handle the failure webhook (or poll the conversation status if no webhook exists, per the M0 notes) → `no_answer` + schedule a retry. The voicemail message has no study details (design §6).
2. **Background worker** (`asyncio` loop started in `main.py`, every 30s): dials `queued` leads whose window has opened and `no_answer` leads whose `next_attempt_at` has passed; it re-checks suppression and hours right before dialing; max 3 attempts, then `closed`.
3. **Live transfer:** the `transfer_to_number` system tool configured with the coordinator's number; if not answered → `needs_human`.
4. **Concurrency guard:** one active call per lead (DB check) so a retry never overlaps a live call.

---

## M5 — Clean clone, mock mode, demo

1. **Mock mode** (`MOCK_MODE=true`, the default with no keys): `scripts/mock_call.py --persona interested|not_fit|chest_pain|...` drives the **same** tool endpoints and post-call webhook with a scripted conversation, so judges see statuses, texts (printed) and the stored record with no accounts.
2. **Read API** (`routes/read_api.py`, `X-API-Key`): `GET /campaigns/{id}` (counts by status, median seconds lead→call), `GET /campaigns/{id}/leads?status=`, `GET /leads/{id}` (answers, calls, transcript, events). These are the fields the dashboard mockup needs.
3. **Persona test run:** the brief's 8 personas played by teammates on real calls. `docs/persona-results.md` lists expected vs. actual for each, with the conversation IDs. Fix the prompt and rerun until it passes.
4. **README:** what it is, a 60-second architecture diagram, setup (uv, `.env`, ngrok, `setup_elevenlabs.py`), mock-mode quickstart, how to run a real call, safety behaviors, the **"Demo: not IRB-approved"** label, data sources + citations (ClinicalTrials.gov NCT07685808, FCC/TCPA explainer, Tufts stats from the brief).
5. Final check from a fresh clone on a second machine: mock mode works with zero keys, and a real call works with keys.

---

## Risks to watch

- **ElevenLabs API shape drift:** mitigated by M0 notes; keep all ElevenLabs calls inside `voice.py` and `setup_elevenlabs.py`.
- **ngrok URL changes** break the tools mid-demo: use a reserved ngrok domain if available, and re-run setup otherwise.
- **Twilio trial limits:** verified numbers only, and a trial message prefix on SMS. Fine for the demo; mention it in the README.
- **The LLM skips `record_answer`:** the backend refuses slots until all required answers exist, so a skipped call fails safe (no booking) rather than wrong.
- **Latency from opt-in to ring:** measure in M2; the call is started in a background task, never after other work.
