# Demo video: 3-minute script and shot list

Target: ~3:00. Record the screen at 1080p and use a phone held to the mic for the call audio (or screen-record the call on the phone). Before recording:
- top up ElevenLabs credits
- run `make dev` plus the tunnel
- clear test leads
- open the dashboard in one window and the opt-in page on a phone

| Time | Shot | Voiceover (say it naturally) |
|---|---|---|
| 0:00–0:15 | Title slide, then the "11% / 37%" slide | "Eleven percent of clinical-trial sites enroll zero patients. One big reason: when someone raises their hand from an ad, a busy coordinator may not call for days." |
| 0:15–0:25 | Opt-in page on a phone: fill name and number, tick consent, tap **Call me now** | "Call Me Maybe changes that. A patient opts in..." |
| 0:25–0:40 | Dashboard: the live call card appears and the **stopwatch freezes** at the ring; the phone rings on screen | "...and within seconds their phone rings. That's the stopwatch: opt-in to ringing in [__] seconds." |
| 0:40–1:25 | Split screen: phone call audio + live transcript streaming; the question tracker ticks "3 of 8" | "Ava says up front that she's an automated assistant, explains the study in one sentence, and runs a pre-screen built from the trial's real criteria. Ask her something that's not in the approved facts, like pay, and she won't guess; the research team follows up." |
| 1:25–1:40 | Ava offers times and books one; toast "Visit booked"; patient text arrives on the phone; coordinator text arrives | "If it looks like a fit, she books the visit on the call. The patient and the coordinator both get a text, and the patient can reply C to confirm or R to reschedule." |
| 1:40–2:00 | **Run scenario → Chest pain** from the header; the live card shows "Please hang up and call 911"; the red emergency toast | "Safety is built in. Mention chest pain and Ava stops and directs them to 911, and the coordinator is alerted instantly. She never gives medical advice and never tells anyone they qualify; the backend decides fit, not the AI." |
| 2:00–2:20 | Scorecard page (all personas green) | "We test that against every persona in the brief: confused, hard of hearing, Spanish-speaking, angry, medical questions. All graded automatically against the live agent." |
| 2:20–2:45 | New campaign: click the melanoma example; the steps animate; the draft appears; hover a fact's quote; click Approve | "And it's not one study. Paste any ClinicalTrials.gov ID, here Regeneron's Phase 3 melanoma trial, and Gemini drafts the script. Every fact must quote the public record, and a coordinator approves it before a single call." |
| 2:45–3:00 | Calendar with the booked visit, then the closing slide with the repo link | "Open source, one command to run, deployable on Vercel. Every interested patient deserves a timely, respectful first call. Thanks!" |

**Shots to capture as B-roll:** the stopwatch freezing, a transcript bubble animating in, a toast sliding in, the funnel bars growing on load.
**Before publishing:** fill in the `[__]` ring time and the scorecard number in the deck from your real run.
