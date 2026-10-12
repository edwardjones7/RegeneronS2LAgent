# Demo call: Ava calls Vonda about the weight-management study

Follows the video: Dr. Rivera accepts the Olatorepatide trial (NCT07685808), and Ava calls the top candidate, Vonda Nader (synthetic patient). About 50 seconds.

Everything Ava says about the study comes from `voice-agent/campaigns/practice-nct07685808.yaml` (approved facts) and her call rules in `voice-agent/app/prompt.py`:
- She says she's an automated assistant and that the call is recorded.
- She says nothing about the study until the date of birth checks out.
- She never says the patient qualifies.

The birth date Vonda gives is made up for the demo.

## Script

**AVA:** Hi, this is Ava, an automated assistant calling from New Brunswick Family Medicine. Just so you know, this call is recorded. Am I speaking with Vonda?

**VONDA:** Uh, yes, this is Vonda.

**AVA:** Great! Before I go on, could you confirm your date of birth for me?

**VONDA:** Sure, it's, um, March 3rd, 1969.

**AVA:** Thank you, Vonda. You were in to see Dr. Rivera back in March. Dr. Rivera thought you might be a good fit for a research study the office is taking part in. It's testing an experimental weight-management medication for adults who don't have diabetes. Would you like to hear a little more?

**VONDA:** Oh. Um, okay, sure. Is it... like, a shot, or?

**AVA:** That's a great question for the office, and I'll make sure they go over it with you. What I can tell you is that the medication is called olatorepatide, it's in the GLP-1 and GIP family of medicines, and the study lasts a little over a year.

**VONDA:** Huh. And would I still see Dr. Rivera, or do I have to go somewhere else?

**AVA:** You'd stay with Dr. Rivera. The office is taking part in the study. The first step is a free screening visit, about an hour, right there at the office.

**VONDA:** Okay. Yeah, I think I'd like to do that.

**AVA:** Wonderful. I have Tuesday at 9:30 in the morning, or Wednesday at 2 in the afternoon. Which works better?

**VONDA:** Um, Tuesday morning's good.

**AVA:** You're all set for Tuesday at 9:30. I'll text you a confirmation. Thanks so much, Vonda, and have a great day!

**VONDA:** You too, thanks. Bye!

## ElevenLabs version (Eleven v3, Text to Dialogue)

Paste each line as its own turn in ElevenLabs' Text to Dialogue with the Eleven v3 model. Bracketed words are v3 audio tags; spoken fillers are written out as text.
- **Ava:** a calm, warm, professional voice.
- **Vonda:** a natural woman in her late 50s.

```
Ava: [warmly] Hi, this is Ava, an automated assistant calling from New Brunswick Family Medicine. Just so you know, this call is recorded. Am I speaking with Vonda?
Vonda: [a little unsure] Uh, yes... this is Vonda.
Ava: Great! Before I go on, could you confirm your date of birth for me?
Vonda: Sure, it's, um... March 3rd, 1969.
Ava: [warmly] Thank you, Vonda. You were in to see Dr. Rivera back in March. Dr. Rivera thought you might be a good fit for a research study the office is taking part in. It's testing an experimental weight-management medication for adults who don't have diabetes. Would you like to hear a little more?
Vonda: [curious] Oh. Um, okay, sure. Is it... like, a shot, or?
Ava: That's a great question for the office, and I'll make sure they go over it with you. What I can tell you is that the medication is called olatorepatide, it's in the GLP-1 and GIP family of medicines, and the study lasts a little over a year.
Vonda: [thoughtfully] Huh. And would I still see Dr. Rivera, or do I have to go somewhere else?
Ava: [reassuring] You'd stay with Dr. Rivera. The office is taking part in the study. The first step is a free screening visit, about an hour, right there at the office.
Vonda: [relieved] Okay. Yeah, I think I'd like to do that.
Ava: [cheerfully] Wonderful. I have Tuesday at 9:30 in the morning, or Wednesday at 2 in the afternoon. Which works better?
Vonda: Um, Tuesday morning's good.
Ava: You're all set for Tuesday at 9:30. I'll text you a confirmation. Thanks so much, Vonda, and have a great day!
Vonda: [laughs softly] You too, thanks. Bye!
```

## Cutting it into the video

- Use a phone-call look: muffle the audio (band-pass around 300 to 3400 Hz) and add a ring before the first line.
- Show the line being said as captions.
- Cut back to the Calendar as "Tuesday 9:30, Vonda Nader" drops in.
