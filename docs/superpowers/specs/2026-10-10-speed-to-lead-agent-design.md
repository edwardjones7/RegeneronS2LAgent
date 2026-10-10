# Speed-to-Lead Clinical Trial Voice Agent ("Call Me Maybe") — Design

Date: 2026-10-10 · Status: draft for approval

## 1. Intent

Clinical-trial sites lose interested patients because first contact happens days late. When someone opts in through an ad or web form for a study, this system calls them **within seconds**, explains the study in one plain sentence, runs the pre-screen questions conversationally, answers their questions strictly from approved study info, books a visit on the call, and texts a confirmation to the patient and an alert to the coordinator.

It is being built for the "Call Me Maybe" hackathon brief (`.claude/context/project-brief.json`). Judges score: solves the problem, it works end-to-end from a clean clone, smart use of data, explains itself, craft and demo. There is an ElevenLabs side prize, which is why ElevenLabs is the voice platform.

**Primary user:** the clinical-trial site research coordinator. **Person on the call:** a prospect who consented to be contacted.

**Current focus:** backend first. Ava has to actually work on a real phone call before any dashboard work starts.

## 2. Goals

1. A lead submitted through the form/webhook triggers a real outbound phone call within ~60 seconds (target: under 45s median).
2. The call sounds warm and human, follows the opening and flow below, and completes pre-screening.
3. Ava answers prospect questions **only** from the campaign's study facts. She never improvises.
4. Ava books a visit on the call against the coordinator's (mock) calendar.
5. On a confirmed booking, and only then, two SMS messages go out: one to the patient and one to the coordinator.
6. Every call produces a stored record: status, structured pre-screen answers, transcript, recording link, summary, and the timeline of events.
7. All non-booking outcomes (section 6) behave safely and are recorded.

## 3. Non-goals (this version)

- The coordinator dashboard UI. The mockup is approved in direction (see section 10), but it is a later phase. The backend must store everything the dashboard will need and expose it through a JSON API.
- Real EHR/CTMS integration. Records live in our own database.
- Spanish or other languages. English only. A non-English speaker is escalated to a human (see section 6).
- Real patient data or calls to anyone other than teammates.
- Final eligibility decisions. The agent never decides eligibility.

## 4. Anti-goals (failure even if it "works")

- Ava says anything about the study that isn't in the approved study facts.
- Ava gives medical advice, or tells someone they "qualify."
- Ava keeps the screening going after an emergency is mentioned.
- An opted-out number gets called again.
- The patient gets a text when nothing was booked.
- The call hides that it's automated. The disclosure line is mandatory.

## 5. The call

**Opening (mandatory, every call):**
> "Hi {first_name}, this is Ava, an automated assistant with the research team at {clinic_name}. Just so you know, this call is recorded. You reached out about our {study_short_name} study. Got a quick minute?"

**Then:**
1. **One plain-language line** about what the study is (from the study file's `one_liner`). No longer pitch.
2. **Pre-screen questions,** asked one at a time and conversationally. The answers are captured as structured data (`record_answer` tool) as they come in.
3. **Questions from the prospect are welcome at any point.** Ava answers only from `approved_facts`, then returns to where she left off. If the answer isn't in the facts: "That's a great question for the research team, I'll make sure they follow up." She does not volunteer extra info if they don't ask.
4. **If the answers look like a fit,** Ava offers 2–3 real open slots and books one. She reads the slot back to confirm. She uses the wording "the research team will confirm eligibility at your visit," never "you qualify."
5. **Close** warmly.

**Tone:** friendly, natural, unhurried. She repeats or slows down when asked, and offers a human at any point.

## 6. Outcomes (all agreed)

| Situation | Ava does | System does |
|---|---|---|
| Fit + books | Confirms slot verbally | Status `booked`; send patient SMS + coordinator SMS |
| Not a fit | Thanks them warmly, says the team will keep their info on file | Status `not_a_fit` (with reason). No SMS |
| No answer / voicemail | Leaves a short voicemail with no study details: "This is Ava from {clinic}'s research team returning your request, we'll try again later." | Status `no_answer`; retry up to 2 more times, only within calling hours |
| Wants a human | Live-transfers the call to the coordinator's phone | If the transfer isn't answered: status `needs_human` |
| "Stop calling me" | Confirms and apologizes | Status `opted_out`; phone added to the suppression list and never called again (any campaign) |
| Emergency (e.g. chest pain) | Stops the flow immediately: tell them to hang up and call 911 | Status `emergency`; flagged red |
| Medical question | Declines to advise, says the team will follow up | Flagged `needs_human` with the question noted (status continues if the call proceeds) |
| Doesn't speak English | Says, slowly, that a team member will call back | Status `needs_human`, note: language |
| Repeated confusion | Clarifies using approved wording; offers a human | If confusion persists: escalate as "wants a human" |

## 7. SMS (only on a confirmed booking)

**Patient:**
> "Hi {first_name}, you're booked with the {clinic_name} research team on {visit_datetime}, {clinic_address}. Questions or need to reschedule? Call {clinic_phone}. Reply STOP to opt out."

**Coordinator** (a push notification; the dashboard is the source of truth):
> "New visit booked: {first_name} {last_initial}., {visit_datetime}, {study_short_name}. Pre-screen: {answered}/{total} answered, {flag_summary}. Called {seconds}s after opt-in. {record_link}"

Opt-out and emergency events are **not** texted to the patient. Whether to also text the coordinator on emergencies and human requests: builder's call, recommended yes.

## 8. Architecture (decided)

- **Voice: ElevenLabs Agents (Conversational AI).** It handles speech-to-text, LLM, text-to-speech, turn-taking and interruptions. The LLM is a Claude model selected inside ElevenLabs. A Twilio number is imported into ElevenLabs; outbound calls are started through ElevenLabs' Twilio outbound-call API. Live transfer to a human uses ElevenLabs' transfer capability (or Twilio call transfer if needed).
- **Telephony + SMS: Twilio.** Trial account; calls and texts only to verified teammate numbers.
- **Backend: Python + FastAPI.** Responsibilities:
  1. `POST /leads`: accept a lead (name, phone, campaign, consent flag + timestamp + source). Reject if there's no consent, the number is suppressed, or it's outside calling hours (then queue it for the next window). Otherwise start the outbound call immediately.
  2. **Agent tool endpoints** (ElevenLabs server tools, called mid-call): `get_open_slots`, `book_visit`, `record_answer`, `opt_out`, `escalate_to_human`, `flag_emergency`.
  3. **Post-call webhook:** receive the transcript, recording, summary and outcome; persist them; send the SMS if booked; schedule retries if no answer.
  4. **Read API** (`GET /campaigns/{id}`, `/campaigns/{id}/leads`, `/leads/{id}`) for the future dashboard and for the demo.
- **Database: SQLite** (via SQLAlchemy or similar; builder's choice). Core entities: campaign, lead, call, pre-screen answer, booking, event (timeline), suppression list.
- **Mock coordinator calendar:** stored in our DB/config with seeded open slots. Booking removes the slot.
- **Campaign file** (one per study, YAML or JSON): clinic name/phone/address, coordinator name + phone, calling hours + timezone, `study_short_name`, `one_liner`, `approved_facts` (the only things Ava may say about the study), `prescreen_questions` (each with id, wording, and the answer that's a fit or a disqualifier), and a `demo_not_irb_approved: true` label.
- **Agent prompt:** generated or templated from the campaign file, so a new study doesn't require prompt editing.

## 9. Demo data

- One real public study from the ClinicalTrials.gov API, turned into a short plain-language demo script, **clearly labeled "not IRB-approved."** Cite the NCT ID.
- **Chosen study (user asked for a Regeneron trial; Claude picked it):** **NCT07685808**, a Regeneron Phase 2, randomized, placebo-controlled study of **olatorepatide** (an experimental GLP-1/GIP drug) in adults living with overweight or obesity **without diabetes**. It was recruiting as of 2026-10-10, ~360 participants, US sites in AL, CA, FL, IL, KS, KY, NY, SC, ~60 weeks. Why this one: weight-loss studies are the kind recruited through ads, the key criteria can be asked over the phone, and it naturally invites the questions that test safety ("should I stop my Ozempic?" is a medical question, so Ava declines).
  - **Demo one-liner (draft, not IRB-approved):** "It's a research study testing an experimental weight-management medication for adults with overweight or obesity who don't have diabetes."
  - **Pre-screen questions (from the public key criteria):** (1) Are you 18 or older? (2) Height and (3) current weight. **The backend computes BMI** (fits if 30–<45, or ≥27 with a condition from Q4). (4) Has a doctor told you that you have high blood pressure, high cholesterol, prediabetes, sleep apnea, or heart or blood-vessel disease? (5) Have you ever been diagnosed with type 1 or type 2 diabetes? (disqualifier) (6) Has your weight changed by more than about 10 pounds in the last 3 months? (disqualifier) (7) Have you had weight-loss surgery? (disqualifier) (8) Have you had pancreatitis or gallbladder problems such as gallstones? (disqualifier) (9) Do you or a family member have a history of medullary thyroid cancer or MEN2? (disqualifier; if they're unsure → flag, don't disqualify)
  - The `approved_facts` come only from the public record: what's being studied, that it's placebo-controlled (some people get a placebo), the length of ~60 weeks, and that adults 18+ are eligible. Anything else (pay, visit count, location details) is demo data and is labeled as such, or Ava says the team will follow up.
  - **The caller identifies as Regeneron (user decided):** `clinic_name` is "Regeneron", so the opening is "...this is Ava, an automated assistant with the Regeneron research team..." Note: the brief describes the agent as working for the site research team rather than the drug company; this demo deliberately departs from that. The campaign file keeps `clinic_name` configurable so a real deployment can use the site's name.
- Synthetic leads (Synthea or hand-made). The phone numbers are teammates' phones only.
- A test plan covering the brief's 8 personas (interested, confused, hard of hearing, Spanish-speaking, angry, chest pain, requests human, asks medical advice), with the expected outcome for each.

## 10. Dashboard (later phase, direction approved)

The mockup lives at `.superpowers/brainstorm/*/content/dashboard-v2.html`: a sidebar with campaigns, the headline "median time to first call," an outcome bar, a filterable lead table, a "Needs your attention" panel, and a lead detail view (summary, pre-screen answers, timeline, recording, transcript). Login is required, and data is per campaign. Not built in this phase. The backend's read API must provide all of it.

## 11. Constraints

- Consent is required before any call; store its source + timestamp.
- Automated-assistant disclosure + recording notice at the start of every call.
- Calling hours enforced in the lead's timezone (default 9 AM–8 PM local; per campaign).
- The suppression list is checked before every call and every retry.
- Secrets are in `.env` (ElevenLabs key, Twilio SID/token/numbers); a `.env.example` is committed.
- Runs from a clean clone by following the README (judging criterion). Local webhooks are exposed via a tunnel (ngrok or similar).
- Cite all external sources in the README.

## 12. Calls made by Claude during the design review (check these)

- **Fit is decided by the backend, not the LLM.** Every `record_answer` is scored against the campaign's fit/disqualifier rules. `get_open_slots` and `book_visit` refuse to run until the backend says the answers so far fit. A clear **hard disqualifier ends the screen right away** (polite close, status `not_a_fit` with the question as the reason). "Not sure" or skipped answers on non-disqualifying questions still allow booking, but are flagged for the coordinator (hence "{answered}/{total} answered").
- **Timezone:** each lead has an optional `timezone` field; when it's missing, the campaign's clinic timezone is used. Calling hours and retries use that timezone.
- **Inbound STOP (user decided):** replying STOP to a text stops **texts only** (handled by Twilio's built-in opt-out). It does not touch the call suppression list. Call opt-outs happen on a call ("stop calling me").
- **Read API auth:** this phase protects the read API with a single shared API key. The data model has campaigns and sites from the start, so real per-user logins for the dashboard can be added later without redoing it.
- **"Runs from a clean clone":** the ElevenLabs agent (prompt, server tools, post-call webhook, phone number link) is **created and updated by a setup script through the ElevenLabs API**, not configured by hand. Re-running it after the ngrok URL changes updates the webhook URLs. The README works with anyone's own ElevenLabs + Twilio keys. A **mock mode** (no keys, no phone) simulates a call through the same tool endpoints and outcome logic, so judges can see the flow without accounts.
- **Build order:** core flow first (lead → call → pre-screen → book → both SMS → stored record), then the non-booking outcomes, then retries/queueing and live transfer.

## 13. Left to the builder

- Project layout, ORM choice, and the campaign file format (YAML vs JSON).
- Exact retry timing within the "2 retries, calling hours only" rule.
- How the post-call outcome is determined (ElevenLabs data-collection fields vs. our tool calls vs. both). It must be reliable for the SMS decision, so prefer our own `book_visit` tool result as the source of truth for "booked."
- The simple way to submit a demo lead (curl, a tiny HTML form, or a script).
- Test approach for tool endpoints and the outcome logic (the voice itself is tested manually with the personas).
- Whether the coordinator also gets SMS for emergencies and human requests (recommended yes).
