# Trialist demo video: recording plan and script

Target: a 2:30 to 2:50 screen recording in the Screen Studio style (smooth cursor, auto-zoom on clicks, clean background).
Flow: landing page, sign in, pipeline walkthrough, dashboard, open a trial, accept, the real call snippet, Campaigns, then Calendar.

Everything below was checked against the code and the running app on 2026-10-11. Numbers in **bold** are live values read from the app that day. Check them again on the morning you record (section 2.6): they change if the matcher runs again.

---

## 1. Tooling and settings

### Recorder: Screen Studio (Mac)

| Setting | Value | Why |
|---|---|---|
| Recording mode | Single window (the Chrome app window from 2.4) | No menu bar, no dock, no other windows |
| Window size | 1440 × 900 viewport | The app is laid out for it: 3-column trial grid, sidebar plus the 360px Campaigns side panel |
| Display | Retina, recorded at 2× (2880 × 1800 source) | Zooms stay sharp |
| Auto-zoom | On, zoom level about 1.6× (not the 2× default) | The UI is dense. At 2× the Accept card loses its context |
| Zoom on typing | Off | No typing in this demo |
| Cursor size | About 1.4× | Reads well at 1080p |
| Cursor smoothing | On, medium-high | Removes hand jitter |
| Hide cursor when idle | On | Matters during the 14-second walkthrough, where you touch nothing |
| Click effect | Subtle ripple, no click sound | Clicks fall under the voiceover |
| Motion blur | On, low | |
| Background | Soft gradient in the app's own colors: peach `#FFD9C7`, blue `#D4E9FB`, green `#E0F2D3`. Or a plain off-white | Matches the wash at the top of every page |
| Padding / corner radius / shadow | About 8% / 12px / medium | |
| Output aspect | 16:9 (the 16:10 window sits centered on the background) | |
| Export | MP4 (H.264), 4K (3840×2160) master, 60 fps, highest quality. Make a 1080p copy for Devpost and YouTube | 60 fps keeps the walkthrough and drop-in animations smooth |

Screen Studio only adds zooms on clicks. For shots with no click (the walkthrough, the live counters), add manual zoom segments on the timeline afterwards. Section 3 says where.

### Alternatives

- **Cap** (cap.so, open source). Similar auto-zoom and backgrounds. Use it if you don't have a Screen Studio license.
- **FocuSee.** Similar feature set.
- **OBS or QuickTime, then DaVinci Resolve or Final Cut.** Record the raw window at 1440×900 and add zooms by hand. This takes much longer to edit.

---

## 2. Pre-recording checklist

### 2.1 Which trial to accept on camera: Olatorepatide (NCT07685808), after a reset

Verified state on 2026-10-11:

- The caller's database (`voice-agent/call_me_maybe.db`, table `trial_acceptance`) already has **NCT07685808 accepted by Dr. Rivera** (row 1, 08:11 UTC). It holds 91 leads: 59 booked, 22 needs_human, 5 chart_review, 5 closed. If you open it now, the modal shows the green "Accepted" card instead of the Accept button, and the calendar week is already full.
- The caller lists 3 other trials as callable, but they have **0 candidates**: asthma NCT07309614 (9 chart review), COPD NCT07053423 (2 chart review), cemiplimab NCT06931717 (0). Accepting any of them makes no calls, so nothing shows up on screen.
- **The running caller reports different numbers from the site.** It started at 04:03 and returns Olatorepatide as 86 candidates / 5 chart review, from the hand-written protocol fallback. The site shows **70 candidates / 38 chart review / 146 checked**, from the engine's results in Supabase. The modal's Accept card gets its numbers from the caller, so on camera it would contradict the patient list next to it. I ran the caller's own code (`ehr.prescreen_trial_counts('middlesex')`) and it now reads Supabase and returns 70 / 38. **A restart fixes the mismatch**, and you need a restart for the reset anyway.

So: reset the caller, then accept Olatorepatide on camera. It is the Regeneron-led trial, it has the hand-written call script (`voice-agent/campaigns/practice-nct07685808.yaml`), and your real call snippet will be about the same study.

(Fallback: after a restart, REGN20934 for obesity, NCT07594093, with **95 candidates / 6 chart review**, is also callable. Its call script would be generated from the registry record, not the hand-written one, so it wouldn't match the call snippet.)

### 2.2 Reset the demo state

There is no reset command, Makefile target or endpoint. The clean way is a fresh SQLite file. The app recreates the tables on startup (`db.init_engine` runs `create_all`), and the practice calendar is created again when a trial is accepted.

```bash
# 1. Stop the caller: Ctrl-C in its terminal, or
lsof -ti tcp:8000 | xargs kill

# 2. Keep a backup of the current state instead of deleting it
cd voice-agent
mv call_me_maybe.db call_me_maybe.backup-$(date +%Y%m%d-%H%M).db

# 3. Start it again in mock mode with fast-forward (same as `make outreach-demo`)
MOCK_MODE=true DEMO_DAY_SECONDS=20 SIMULATED_CALL_SECS=5 uv run uvicorn app.main:app --port 8000
#   if uv isn't on your PATH:
MOCK_MODE=true DEMO_DAY_SECONDS=20 SIMULATED_CALL_SECS=5 .venv/bin/uvicorn app.main:app --port 8000

# 4. Check: NCT07685808 should say accepted: false, candidates: 70, chart_review: 38
curl -s -H "X-API-Key: dev-read-key" localhost:8000/practices/middlesex/trials | python3 -m json.tool | head -20
```

Leave `DEMO_PHONES` **unset** for the screen take. Every patient is simulated, so there's no "Test call" banner on Campaigns, no "Real phone" row, and no lead stuck on a call that mock mode can't finish. The real call is recorded separately (section 3, shot 10).

**For every retake from the Accept step onward, repeat 2.2.** Takes that end before Accept (landing and walkthrough) don't need a reset.

### 2.3 What the fast-forward settings do (from the code)

- `DEMO_DAY_SECONDS=20`: a "day" between retries lasts 20 seconds, and calling hours are ignored. Today is Sunday, and calls normally don't run on Sundays. With fast-forward on you don't need `CALL_SUNDAYS`.
- `SIMULATED_CALL_SECS=5`: each simulated call ends 5 seconds after it starts.
- The worker runs every 3 seconds in fast-forward. `BATCH_SIZE` defaults to 10 calls at a time.
- Simulated outcomes are fixed per patient: about 28% book on a given try, about 32% voicemail, about 26% no answer, and the rest decline or need follow-up. Some people who miss the call ring back after the text and book.
- Visit times are 9:30, 11:00, 2:00 and 4:30, an hour each, on weekdays. Ava books the earliest open time that is at least 12 hours away. So the first bookings fill the week the Calendar page shows (next week, Oct 12–16, if you record on Sunday).

My estimate, which a dry run should confirm: the first bookings appear about 5 to 10 seconds after Accept, then roughly 3 every 7 seconds. The 16 to 20 visible slots fill in about 45 to 60 seconds. If you need longer than about 20 seconds after Accept to reach the Calendar, start the caller with `BATCH_SIZE=5` so visits keep dropping in while you're on that page. Campaigns will then show "5 on a call" instead of 10.

### 2.4 Start the site for recording

The site is running with `next dev` on :3001. Next's dev indicator badge sits in the bottom-left corner, over the sidebar's doctor card, and the first load of each page compiles slowly. For the take, use a production build:

```bash
# stop the dev server on :3001 first (both use site/.next)
cd site
npm run build && npx next start -p 3001
```

`site/.env` already points at the caller (`CALLER_URL`, `CALLER_API_KEY`). If the build fails, record with `next dev` and crop or mask the badge.

**Note:** `site/src/pages/_app.tsx` and `AppShell.tsx` have uncommitted changes (someone is moving the walkthrough into `_app` so it starts on the Sign in click). Record after that work is finished, and watch the walkthrough once to confirm the timings in shot 5.

### 2.5 Browser

Open a clean Chrome app window with no tabs, no address bar, no extensions and no bookmarks:

```bash
open -na "Google Chrome" --args --user-data-dir=/tmp/trialist-demo \
  --app=http://localhost:3001 --window-size=1440,928 --window-position=0,0
```

- The app window's title bar takes about 28px. Check the page area is 1440×900: open DevTools, run `innerWidth, innerHeight` in the console, close DevTools, and adjust `--window-size` if it's off.
- Page zoom 100% (⌘0).
- macOS: Focus / Do Not Disturb on. Quit Slack, Messages and Mail. Hide desktop icons. **System Settings → Accessibility → Display → Reduce motion: off.** The walkthrough, modal, drop-in and toast animations are `motion-safe` and won't play otherwise.
- Pre-warm, after the reset and **without accepting**: load `/`, `/trials`, `/trials?trial=NCT07685808` (wait for the patient list), `/campaigns`, `/calendar`, then go back to `/`. Do this in the same window just before recording.
- The dashboard greeting depends on the time ("Good morning / afternoon / evening, Dr. Rivera."). Any of them is fine.

### 2.6 Check these numbers the morning you record

| Where | What it said on 2026-10-11 |
|---|---|
| Landing hero pill | **24 of 147 open trials** fit this practice's patients |
| Walkthrough | **147** open trials. **200** patients, pre-screened against **39** open trials. **24** trials fit. Run dated **Oct 11, 2026** |
| Dashboard header | New Brunswick Family Medicine · **200 patients**. **24 trials fit** your patients, with **399 pre-screen candidates** between them |
| Dashboard order | 1 Ebola Virus Disease / Ervebo (**151** · 7), 2 Overweight or Obesity / REGN20934 (**95** · 6), 3 Overweight or Obesity / **Olatorepatide (70 · 38)**, 4 Healthy Volunteer / REGN22044 (44 · 6) |
| Olatorepatide modal | **146 checked**, Candidates **70**, Chart review **38**. Accept card: **70** pre-screen candidates, **38** need chart review (after the restart) |

If any of these change, change the matching voiceover line. Never say a number that isn't on screen or in the table in section 4.

---

## 3. Shot list

Times are positions in the finished cut. "Hold" means leave the cursor still so the viewer can read.

| # | Cut time | Shot |
|---|---|---|
| 1 | 0:00–0:08 | Landing hero |
| 2 | 0:08–0:17 | Scroll to the figures card |
| 3 | 0:17–0:26 | Scroll to "Your patients stay yours." |
| 4 | 0:26–0:30 | Bottom Sign in |
| 5 | 0:30–0:44 | Pipeline walkthrough |
| 6 | 0:44–0:54 | Dashboard |
| 7 | 0:54–1:30 | Olatorepatide modal: patients and criteria |
| 8 | 1:30–1:36 | Accept |
| 9 | 1:36–1:44 | Campaigns, first seconds |
| 10 | 1:44–2:08 | **Real call snippet (spliced in)** |
| 11 | 2:08–2:18 | Back on Campaigns, further along |
| 12 | 2:18–2:36 | Calendar, visits dropping in |
| 13 | 2:36–2:50 | End card |

**1. Landing hero (8s).** Page loaded and scrolled to the top. The cursor starts off to the right and drifts slowly to the fanned trial cards; don't click. Manual zoom to 1.3× on the headline "Trials come to doctors with the patients already found." for the first 4 seconds, then ease out to show the pill "24 of 147 open trials fit this practice's patients".

**2. Figures card (9s).** Scroll down slowly with the trackpad, one smooth movement, until the "Trials stall at the site, not the ad." card is centered. Hold. Manual zoom to 1.5× on "11% of trial sites enroll zero patients" and "37% of sites under-enroll". Keep the small "Figures from Regeneron's challenge materials." line in frame at least once.

**3. Privacy card (9s).** Keep scrolling past "How it works" (it can go by) to "Your patients stay yours." Hold. Manual zoom to 1.4× on the three checked lines, especially "Identifiable patient data never leaves your practice."

**4. Sign in (4s).** Scroll to "See it with a demo practice." and click the large **Sign in** button. Auto-zoom picks up the click and the button shows "Signing in…". Using this bottom button saves you scrolling back up. (Short version: skip shots 2 and 3 and click Sign in in the header. Then say the privacy line over shot 7.)

**5. Pipeline walkthrough (about 14s, no cursor).** Don't touch anything, and don't press Esc (Esc closes it). From `PipelineWalkthrough.tsx`:
- 0–4.6s **Fetch trials**: trial rows stream down on the left, and the count rises to **147** "open trials" in about 3.5s.
- 4.6–10.0s **Match patients**: 4 trial cards are dealt into a deck, one every 1.15s (Ebola, REGN20934, Olatorepatide, REGN22044). Each fills its patient dots green (candidates) and amber (chart review). The big number rises to **24**. The copy reads "Your 200 patients, pre-screened against 39 open trials. Records never leave your practice."
- 10.0–13.2s **Recommend**: "**24** trials fit your patients" and a "See your trials" button. Don't click it; let it time out.
- 13.2–13.9s: it fades into the dashboard.

In the edit, add a slow 1.0× to 1.15× zoom across the Match scene so it doesn't feel static.

**6. Dashboard (10s).** Hold 2s on the header ("24 trials fit your patients, with 399 pre-screen candidates between them"); auto-zoom won't fire, so add a 1.4× manual zoom there. Then move the cursor across the first row. Hovering a card lifts its detail panel (ages, sex, enrolling, end date) and shows "70 candidates · 38 to review". End by hovering the third card, **Overweight or Obesity · Olatorepatide**, and click it.

(Optional, about 3s: before opening it, click the **Metabolic and kidney** chip. The grid narrows to the obesity, cholesterol and kidney trials, and the Ebola trial at #1 drops out of frame. See "Decisions for you".)

**7. Trial modal (36s). This is the most important shot in the video. Don't rush it.**
1. (0–5s) The modal opens. Hold on the header: Metabolic and kidney, Phase 2, "Overweight or Obesity", "Olatorepatide · Regeneron Pharmaceuticals". Auto-zoom about 1.4× on the header and the Accept card on the right (70 pre-screen candidates, 38 need chart review).
2. (5–10s) Move to "Your pre-screened patients · 146 checked". The tabs read **Candidates 70 | Chart review 38**. Let the zoom sit on the tabs and on the grey line under them, which ends "Names show here because this list runs inside your practice; only counts leave it."
3. (10–19s) Click the **first candidate row** (top score; it was Vonda Nader, 0.997, on Oct 11). It expands into the criteria list: a **Passed** badge on each row, with "Rule on the chart" or "Model read of the chart" underneath. Hold. Then click "Confirm at screening · 2" to show the items no chart can answer (e.g. "Change in body weight >5 kg within approximately 3 months before screening").
4. (19–30s) Click the **Chart review** tab, then the first row (it had a "2 to check" badge). It shows the amber box "Why it needs a chart check" and **Unknown** badges at the top, e.g. "Is the patient's latest BMI 30.0 to under 45.0 kg/m2?". Hold 3s on the Unknown rows. This is the honesty point, so give it time.
5. (30–36s) Move the cursor to the Accept card on the right. Hold on "Ava calls them from Dr. Rivera's office and books screening visits here. Chart-review patients wait for your staff."

**8. Accept (6s).** Click **Accept trial**. The button reads "Starting outreach…" for 1 to 3 seconds (the caller builds the call list), then the app goes to `/campaigns?nct=NCT07685808`. Auto-zoom on the click.

**9. Campaigns, first seconds (8s).** "Here's how Ava is doing, Dr. Rivera." · "1 trial accepted". In the first poll (every 4s), the first stat shows "N of 108 called · 10 on a call" with a pulsing blue dot, and rows flip to the blue "On a call" pill. Manual zoom 1.4× on the stat row. **Cut here to the call snippet.**

**10. Real call snippet (about 24s, spliced in).** Recorded separately. See "Recording the call snippet" below.

**11. Back on Campaigns (10s).** Cut back into the same take further along (any point where Booked is above 0). The green number "screening visits booked" has gone up and the stage bar has a green segment. Zoom on the right column:
- **Check these charts · 38**: the chart-review queue with the "Chart checked, call" buttons. Don't click them.
- **Needs a person**: this fills as patients ask for a person.
- **Coming up**: upcoming visits.

Then click **Calendar →** in the Coming up header.

**12. Calendar (18s).** "Here's your week, Dr. Rivera." Hold still. Every 4 seconds a poll brings new visits: each one drops into its slot (`animate-drop-in`), and a toast slides up in the bottom-right corner ("Ava just booked {name} for {day, time}" or "Ava just booked 3 visits"). The "N booked / N open" counts in the toolbar change. Wait for at least two toasts. Then click one booked visit: the popover shows "screening visit", "Booked by Ava on a call", and "Simulated patient: no recording." Press Esc.

**13. End card (14s).** In the editor, not the app: logo, the line "Trials come to doctors with the patients already found.", the repo URL `github.com/edwardjones7/RegeneronS2LAgent`, MIT license, the live link (see Decisions), and "Synthetic patients from Synthea. No real people."

### Recording the call snippet (shot 10)

What Ava says, from `voice-agent/app/prompt.py` and the README:
1. "Hi, this is Ava, an automated assistant calling from Dr. Rivera's office. Just so you know, this call is recorded. Am I speaking with {first name}?" The office name comes from the practice profile; once the trial is accepted by Rivera, it reads "Dr. Rivera's office".
2. After the patient says yes: "Great! Before I go on, could you confirm your date of birth for me?" The date is checked on the server through `verify_identity`. Ava and the LLM never see the date on file.
3. Only then does she say the study one-liner: "It's a research study of an experimental weight-management medication for adults living with overweight or obesity who don't have diabetes." She may add one line from the chart, like "you were in to see Dr. Rivera back in March", and approved facts from the campaign file (Phase 2, about 60 weeks, placebo, voluntary).
4. She offers screening visit times (about an hour, at the office, free) and books one.

Setup, in a separate session from the screen take:
- `voice-agent/.env`: `MOCK_MODE=false`, the ElevenLabs key (`ELEVEN_LAB_API_KEY` is there already), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` (**not set at the moment**), `PUBLIC_BASE_URL` set to a tunnel (`cloudflared tunnel --url http://localhost:8000`; cloudflared wasn't on the PATH I checked), and `DEMO_PHONES=+1…`, a teammate's verified number.
- `make elevenlabs`, then restart the caller. Reset the DB (2.2) and accept Olatorepatide in the app. The first candidate gets the real phone. The Campaigns page shows a "Test call" banner with the synthetic patient's name and birth date: that's the birth date the teammate gives Ava.
- **Audio:** take it from the call recording, not from the phone. iOS screen recordings generally don't capture call audio. Sources:
  - The ElevenLabs dashboard: the agent's conversation history has a download.
  - The caller: `GET /leads/{id}/calls/{call_id}/recording` with the `X-API-Key` header.
  - The Calendar popover for that booked visit, which has a "Listen to the call" player.
- **Picture:** choose one.
  - (a) Film the phone ringing on a desk with a second camera, then cut to a full-frame waveform with captions.
  - (b) Screen-record the phone (silent) for the incoming call screen, then lay the downloaded audio over it.
  - (c) Screen-record the Campaigns page during the real call, so the "Real phone" row goes from "On a call" to "Booked" and the visit drops into the calendar. Intercut it with (a) or (b).
- If the Twilio account is a trial account, outbound calls start with a trial notice. Cut it.
- Cut it down to about 20 to 25 seconds. **Keep the automated-assistant and recorded-call line, and the date-of-birth question.** They're the evidence for the privacy claims. Then one line of the study description and the booking confirmation.

---

## 4. Voiceover script

Plain and specific. About 330 words for about 2:45, at a calm pace. [Brackets] are numbers to re-check per 2.6. Every figure comes from the app on screen or from Regeneron's challenge materials (`.claude/AGENTS.md` §8).

| Shot | Line |
|---|---|
| 1 | Most clinical trials struggle to enroll. Trialist starts from the doctor: it shows each practice only the trials its own patients could join. |
| 2 | In Regeneron's figures, 11% of trial sites enroll no patients at all, and 37% enroll fewer than planned. The usual fix is advertising to patients. The harder problem is finding the doctor who already has them. |
| 3 | The matching runs inside the practice. Identifiable patient data stays there, and the patient stays with their own doctor. |
| 4 | We'll sign in as Dr. Rivera, a demo practice with synthetic patients. |
| 5 | First it pulls every open Regeneron trial: [147]. Then it pre-screens this practice's [200] patients against them. [24] trials have at least one patient who might fit. |
| 6 | They're ranked by how many of the doctor's own patients could join. Each card shows two numbers: pre-screen candidates, and patients who need a chart review. |
| 7.1–7.2 | This is a Phase 2 Regeneron study in obesity. [146] patients were checked. [70] passed every criterion their chart can answer. [38] need someone to look. |
| 7.3 | For each patient you see every criterion, whether it passed, and whether a rule or a model reading the chart decided it. Some things no chart answers. Those are confirmed at the screening visit. |
| 7.4 | Here the chart had no recent BMI, so the answer is Unknown. We don't count that as a pass. A person checks it before anyone calls. |
| 7.5 | The names only show inside the practice. A count is all that leaves it. |
| 8 | The doctor accepts. That's the only step they take. |
| 9 | Ava, our voice agent, starts calling the [70] candidates from Dr. Rivera's office. The [38] chart-review patients wait for staff. |
| 10 | *(no voiceover; the call plays, with captions)* |
| 11 | She says up front that she's an automated assistant and the call is recorded, and she confirms the date of birth before she mentions the study. The check happens on our server; the voice model never sees the date. |
| 12 | Screening visits go straight onto the practice's calendar. The visit is at the practice, with the patient's own doctor. |
| 13 | Other teams build the recruitment call. We work one step before it: finding the patients and the doctor who can enroll them. The patients here are synthetic, from Synthea. It's open source under MIT. |

Optional extra for shot 7 or 13, if there's time: "A patient who fails screening costs the sponsor a visit. Regeneron puts a visit at $3,562." This doesn't claim we reduce screen failures by a measured amount; we haven't measured it.

Wording rules, from `.claude/AGENTS.md`:
- Say "pre-screen", never "qualify".
- Don't say it saves lives.
- Don't claim accuracy.
- Don't use ad or "Tinder" framing.
- Don't say anything about a sponsor-side map. That view isn't built, so don't show or describe it.

---

## 5. Edit notes

- **Transitions:** use hard cuts between shots. The app already has its own (the walkthrough dissolve, the modal opening, the page change on Accept), so don't stack extra transitions on top. The only built-in transitions are the cut into the call snippet and back out. For those, use a 6 to 8 frame dip to a soft background color, or a J-cut where Ava's first word starts under the last frame of shot 9.
- **Captions:**
  - Burn in captions for the call snippet, since phone audio is hard to follow. Label the speakers "Ava" and "Patient (teammate, synthetic record)".
  - Add a small lower-third once at shot 4: "Synthetic patients (Synthea). No real people."
  - Add one during the call: "Hackathon demo. Not IRB-approved."
  - Optionally caption the whole voiceover for people watching muted.
- **Music:** quiet instrumental. Around −28 to −30 LUFS under the voiceover (voiceover at about −16 LUFS). Dip the music to almost nothing during the call snippet so Ava is clear, and bring it back at shot 11.
- **Zooms:** remove any auto-zoom that lands on a click with nothing important (e.g. the scroll in shot 3). Keep zooms at 1.6× or less, and hold each for at least 1.5 seconds before zooming out.
- **Speed:** don't speed up the walkthrough; it's timed. Shots 9 and 11 come from the same continuous take: the cut into the call hides the time that passes. If the Calendar needs more drop-ins, speed up dead time between toasts to 1.5× at most. Don't speed up the toast itself.
- **Length check:** if the cut runs over 2:50, cut shot 3 first (move its line to 7.5), then shot 2's scroll (keep its line over the hero).

---

## 6. Decisions for you

1. **Reset the caller database.** Section 2.2 moves `voice-agent/call_me_maybe.db` aside. It currently holds the accepted Olatorepatide campaign: 91 leads, 59 bookings, and event and call history. Check no teammate needs that state live. The backup file keeps it.
2. **Restart the caller before recording, whatever else you decide.** Until then, the Accept card shows 86 / 5 next to a patient list of 70 / 38.
3. **The Ebola trial ranks #1 on the dashboard** (Ervebo, ANRS-led with Regeneron as a collaborator, healthy volunteers, **151** candidates). A clinical judge may ask why a Guinea Ebola vaccine study tops a New Jersey family practice's list. Options:
   - Leave it.
   - Click the "Metabolic and kidney" chip before opening Olatorepatide (optional step in shot 6).
   - Have someone review that trial's criteria.

   It's also the first card dealt in the walkthrough, which you can't avoid.
4. **Long or short opening:** the landing scroll in shots 2–4 (about 30s, covers the figures and privacy) or header Sign in (about 10s).
5. **Phone setup for the real call:**
   - Whose phone.
   - Twilio account and number (no Twilio keys in `voice-agent/.env` today).
   - Tunnel (cloudflared not found on the PATH I checked).
   - Whether `make elevenlabs` has been run against the current tunnel (`ELEVENLABS_AGENT_ID` isn't in `.env`).
   - Which picture option (a, b or c) you want for shot 10.
6. **Ending:** Campaigns then Calendar (recommended, about 28s total), or just one of them. If only one, pick Calendar: the drop-ins and toast are the better visual.
7. **Batch size:** keep 10 (busier Campaigns page) or use 5 (visits keep dropping in longer on Calendar). Decide after one dry run.
8. **Voice:** your own voiceover or captions only. And whether to name Grove AI in shot 13 (`.claude/AGENTS.md` §10 says to say the competitor framing out loud).
9. **Live link:** I couldn't find the Vercel URL in the repo. Add it to the end card. The Devpost page is `devpost.com/software/trialist`.
10. **The X/Twitter references you opened** couldn't be read (see the summary). If they show a specific style (pacing, captions, zoom style), paste the text or describe it, and I'll adjust sections 1, 3 and 5.
