# Outbound caller: design

Date: 2026-10-11. Owner: Eddie. Status: approved and built (`voice-agent/`).

## Intent

The product finds the doctor who already has the patients (see `.claude/AGENTS.MD`). Once a doctor accepts a trial, those patients still have to be reached and booked. The outbound caller does that: **Ava calls the doctor's own pre-screened patients, from the doctor's own office, and books them a screening visit.** The doctor does nothing after accepting.

It's the activation layer in AGENTS.MD section 3. It isn't the novel part (Grove AI does recruitment calls); what makes it better is that the patients are warm, pre-matched, and hear from their own doctor's office. **The bar is that it sounds like a real person from their doctor's office.** That's what "elite" means here.

## Who does what

| Owner | Builds |
|---|---|
| Backend teammate | Per practice: which trials it has pre-screen candidates for, and how many. Doctor-facing counts. |
| Frontend teammate | The doctor's screens, including the call list and statuses this design exposes. |
| **This design (the caller)** | Everything after the doctor clicks accept: recording the acceptance, building that trial's candidate list, the calls, texts, voicemails, inbound callbacks, booking, reminders and the staff queue. |

The caller must build its candidate list **from the same engine the backend uses for its counts**, so the number the doctor saw is the number that gets called. It must not re-implement eligibility.

## Decisions (Eddie's)

- Calls come from the patient's doctor's office. Ava introduces herself as calling from that office.
- The goal of every call is a booked screening visit.
- Calls go out automatically when the doctor accepts a trial. The doctor should have as little work as possible.
- No answer: leave a voicemail, send a text, retry the next day.
- 3 tries over 3 days, then the patient goes to a person in the office, who decides whether to keep going or drop them.
- Still ElevenLabs (and Twilio) for voice and text.
- In, all five of:
  1. **Inbound callbacks.** When a patient calls the number back, Ava answers, knows who they are and why the office called.
  2. **Book by text.** The no-answer text offers real times; replying with a number books it.
  3. **Personal touch from the chart.** For example, "you were in to see Dr. Patel back in March".
  4. **One conversation across channels.** "Call me after 5" moves the next try; booking anywhere cancels every pending call and text; "stop" stops everything.
  5. **No-show prevention.** Confirmation text with a calendar invite, a day-before reminder, reply C to confirm or R to reschedule.

## Behavior

### 1. Doctor accepts a trial

- The doctor clicks accept on a trial card (frontend). The caller records the acceptance: practice, trial, who accepted, when.
- The caller builds the call list: that practice's **pre-screen candidates** for that trial. Patients in the "needs chart review" bucket are **not** called until someone in the office clears them. Calling them risks a wasted screening visit, the cost we pitch saving.
- Calls start automatically, in small batches (my call: 10 at a time), only within calling hours (my call: 9am–8pm in the patient's time zone, Monday to Saturday).

### 2. The call

The flow, as a script outline. Ava's wording is natural; this is the order, not the words.

1. **Who's calling, plus the disclosure.** "Hi, this is Ava, an automated assistant calling from Dr. Patel's office. This call is recorded." The office name isn't health information; the voicemail uses it too.
2. **Confirm it's the patient.** "Am I speaking with Maria?", then date of birth before anything health-related. Nothing about health or a study until the patient is confirmed.
   - Someone else answers: ask for Maria, or leave only "Dr. Patel's office called, please call us back at [number]."
3. **Personal touch.** One line from the chart, such as their last visit with the doctor, never a diagnosis or result.
4. **Why the call, in one sentence.** Dr. Patel's office is taking part in a research study and the doctor thought Maria might be a good fit. **Never "you qualify"**; the screening visit is where they check.
5. **Questions.** Answered only from the trial's approved facts. Anything else goes to the office staff.
6. **Book.** Offer 2–3 screening visit times at the practice. Book one on the call.
7. **Wrap up.** Confirm the time, say a text is coming, thank them.

Kept from the existing voice agent:
- 911 guidance and an urgent staff alert on any emergency.
- No medical advice.
- Transfer to a person on request.
- Spanish from pre-written wording.
- "Stop calling me" means opt out of everything; "not interested" ends this trial's outreach only.

### 3. No answer, or voicemail

- **Voicemail:** short, with no study or health details. "Hi, this is Ava from Dr. Patel's office, please give us a call back at [number]." Leave it only when a machine is detected. If nobody picks up and there's no machine, leave nothing.
- **Text, after every missed attempt:** the office name, a reason with no health details ("about a research study Dr. Patel thought you might be interested in"), 2–3 times to book by reply, the callback number, and "Reply STOP to opt out." My call: the study name stays out of texts, since texts can be seen on a lock screen.
- **Retry:** next day, at a different time of day than the last attempt (my call), within calling hours.
- **After the third attempt** with no booking and no reply: the patient goes to the staff queue (section 7).

### 4. Inbound callbacks

- The patient calls the number Ava called from or texted. Ava answers.
- She matches the caller ID to the patient. On a match, after the identity check, she picks up the thread: "Thanks for calling back, Maria! Dr. Patel's office was reaching out about…"
- No match (an unknown number, or a family member's phone): she asks who they're calling about and verifies with name and date of birth before saying anything health-related.
- Callbacks outside calling hours still get answered.

### 5. Text replies

- **A number (1, 2, 3):** books that time, then sends the confirmation.
- **A time preference** ("call me after 5", "tomorrow morning"): moves the next try. Unclear free text goes to the staff queue.
- **STOP:** opts out of everything. **"Not interested":** ends this trial's outreach.
- **After booking:** C confirms; R offers new times; CANCEL cancels.

### 6. After booking

- Confirmation text with the time, the practice address and a calendar invite link.
- Reminder text the day before.
- All pending calls and texts for that patient and trial are cancelled.

### 7. Staff queue

- A patient lands here after 3 attempts with no booking, after an unclear text reply, on a transfer request, or after an emergency flag.
- A staff member can: call again (restarts the sequence), mark contacted, or drop.
- Every patient's full history is visible: calls with transcripts and recordings, voicemails, texts both ways, bookings.

### 8. What the doctor sees

Nothing they have to do. The frontend teammate's call list reads, per patient: status (queued, calling, voicemail left, texted, booked, confirmed, needs staff, opted out, dropped), attempts, next try, and booking. Counts per trial: called, reached, booked.

## The demo

**3-minute video: accept, Ava calls a real phone, books; a missed call becomes a voicemail and a text; a callback is answered.**

- **Phone numbers:** Synthea patients have no phone numbers, and the Twilio trial account only reaches verified numbers. A handful of demo patients get the team's real, verified phone numbers; everyone else is simulated, so the call list still visibly progresses. The simulated calls use the existing text-mode ElevenLabs conversations. My call.
- **Fast-forward:** a demo mode compresses the sequence, so a "day" passes in about a minute and the 3-day sequence plays out on screen. Off by default.
- **Doctor and office names:** no names are invented for practices (AGENTS.MD section 7). Ava uses the signed-in doctor's own name from their account. In the demo, that's whoever is demoing, labeled illustrative.

## Eddie's answers to the builder check (2026-10-11)

- **Patient data sent to ElevenLabs and Twilio: minimum necessary.**
  - Ava starts each call knowing only the patient's first name, the doctor and the office.
  - The date of birth is checked by our server through a tool, so Ava and the LLM never see it.
  - Trial facts and anything health-related unlock only after that check passes, through the same tool.
  - The personal touch is one pre-written sentence built on our server ("you were in to see Dr. Patel in March"), never a diagnosis, result or medication.
  - Twilio gets the phone number and the de-identified texts.
  - This exception is written into AGENTS.MD section 5.
- **Screening questions on the call: yes, only for criteria the chart can't answer.** Each protocol's `review` criteria that a patient can answer (for example, thyroid cancer family history for olatorepatide) become one or two short phone questions, asked after identity is confirmed and before booking.
  - Answers are recorded and shown to staff.
  - An answer that rules the patient out ends with a kind "the office will follow up". Ava never says "not eligible" or "you don't qualify".
  - Criteria only a test can settle (FeNO, PD-L1) are not asked.
- **Staff queue: adapt the voice agent's existing coordinator dashboard, and make it better.** It becomes the office staff's screen:
  - the staff queue
  - chart-review clearing (a cleared patient joins the call list)
  - the live call view
  - each patient's full history
  - the visits calendar

  It keeps the existing design system: shadcn/ui, Motion and the Regeneron branding.

## Builder-check answers (my calls, for Eddie to check)

- **If time runs short, cut in this order:**
  1. the personal touch
  2. "call me after 5" time preferences, so free text goes to staff instead
  3. booking by text
  4. no-show reminders (mostly built already)

  Inbound callbacks are cut last; Eddie singled them out.
- **Twilio upgrade: still open.** On a trial account, the voicemail moment and clean texts can't be filmed. The plan should assume an upgrade, with a fallback of filming the voicemail and text on a simulated patient.

- **The opening order:** Ava says who she is and that the call is recorded before asking for the patient. Patients won't confirm anything to an unnamed caller.
- **The old ad opt-in flow doesn't need to keep working.** AGENTS.MD section 10 drops ads as a framing. The caller can generalize or replace the voice agent's lead and campaign tables instead of running both.
- **Approved facts for the trials:** only olatorepatide has an approved fact sheet today, written as "the Regeneron research team". Facts for the other trials are drafted from the ClinicalTrials.gov record with the existing evidence-checked drafter. The team reviews them once, before the demo, not the doctor. All wording is rewritten from the doctor's office's point of view.
- **Doctor's name and address:** practices get a profile (doctor display name, address, callback number). The doctor's name comes from their account. The address is a clearly labeled demo address, like the voice agent's existing "(demo address)".
- **Consent basis:** the existing patient–practice relationship, with a per-patient "OK to contact" flag that the dial guard checks, replacing the voice agent's opt-in consent check. Demo phone numbers belong to teammates who agreed to be called. Noted as a limit in the README: real deployment needs the practice's own consent and TCPA review.
- **Staff contact:** each practice profile has a staff phone number for transfers and urgent alerts.

## Constraints

- **Privacy:**
  - Before identity is confirmed, nothing health-related is said or left on voicemail.
  - Texts carry no health details.
  - Patient records are read scoped to one practice only (see `site/src/lib/utils/db/client.ts`).
  - The Jev rule applies if the caller ever sends patient data to a model: de-identified only.
- **Claims:** never "qualify"; "pre-screen candidate" and "screening visit". Every fact Ava states comes from the trial's approved facts.
- **Consent and calling rules:**
  - The disclosure line on every call.
  - STOP honored immediately on every channel.
  - Calling hours.
  - At most 3 attempts before a person decides.
- **Reuse:** extend `voice-agent/`, which already has calling, voicemail detection, booking, two-way texts, reminders and the safety rules. Don't rewrite it.

## Goals

- A doctor accepts a trial, and with no further work, patients get called, texted and booked.
- Callbacks and text replies land in the same conversation the call started.
- It sounds like their own doctor's office.

## Non-goals

- Deciding eligibility (the engine's job).
- Doctor-facing UI (the frontend teammate's).
- Real EHR scheduling. Visit times come from demo slots per practice.
- Calling chart-review patients before staff clear them.

## Anti-goals (failure even if it works)

- **Telling anyone they "qualify,"** or naming a condition to the wrong person.
- **Contacting someone after they booked or said stop.**
- **Sounding like a call center or a pharma company** instead of their doctor's office.
- **The doctor having to manage the outreach.**

## Left to the builder

- Data model for acceptances, outreach, attempts and messages, and where it lives. My call: Supabase, through a new numbered migration, so the frontend can read statuses directly.
- How the caller gets candidate IDs from the engine (shared function or backend endpoint), coordinated with the backend teammate.
- Batch size, retry timing, fast-forward speed.
- Parsing text replies (keywords first; free text to staff).
- How the ElevenLabs agent gets per-call context (patient first name, office, doctor, personal touch, trial facts, slots): per-call overrides, as the voice agent does today.
- Inbound setup: a Twilio number pointed at the ElevenLabs agent for inbound, with a lookup tool by caller ID.
