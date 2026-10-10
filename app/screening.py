"""Pre-screen scoring. The backend, not the voice agent, decides whether someone looks like a fit.

`decide()` also tells the agent which question to ask next, so the question order and
wording always come from the campaign file.
"""

import re
from dataclasses import dataclass, field

from app.campaigns import Campaign, Question

# ---------------------------------------------------------------- number words

_UNITS = {
    w: i
    for i, w in enumerate(
        "zero one two three four five six seven eight nine ten eleven twelve thirteen "
        "fourteen fifteen sixteen seventeen eighteen nineteen".split()
    )
}
_TENS = {w: 10 * i for i, w in enumerate("_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()) if w != "_"}
_NUMBER_WORDS = set(_UNITS) | set(_TENS) | {"hundred"}


def _words_value(words: list[str]) -> int:
    """'sixty one' -> 61, 'two hundred twenty' -> 220, 'two twenty' -> 220."""
    if "hundred" in words:
        i = words.index("hundred")
        head = _words_value(words[:i]) if i else 1
        return head * 100 + (_words_value(words[i + 1 :]) if words[i + 1 :] else 0)
    groups, cur = [], None
    for w in words:
        if w in _TENS:
            if cur is not None:
                groups.append(cur)
            cur = _TENS[w]
        elif w in _UNITS:
            if cur is not None and cur >= 20 and cur % 10 == 0 and _UNITS[w] < 10:
                cur += _UNITS[w]
            else:
                if cur is not None:
                    groups.append(cur)
                cur = _UNITS[w]
    if cur is not None:
        groups.append(cur)
    if len(groups) == 2 and groups[0] < 10 and groups[1] >= 10:  # spoken "two twenty"
        return groups[0] * 100 + groups[1]
    return groups[0] if len(groups) == 1 else int("".join(str(g) for g in groups))


def words_to_digits(text: str) -> str:
    tokens = re.findall(r"[a-z]+|[^a-z]+", text.lower().replace("-", " "))
    out, run = [], []
    for tok in tokens + [""]:
        if tok in _NUMBER_WORDS:
            run.append(tok)
            continue
        if run and tok.strip() == "" and tok != "":
            continue  # whitespace inside a run of number words
        if run:
            out.append(f" {_words_value(run)} ")
            run = []
        out.append(tok)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def _first_number(text: str) -> float | None:
    m = re.search(r"\d+(?:\.\d+)?", text)
    return float(m.group()) if m else None


# ---------------------------------------------------------------- parsers


def parse_height_inches(text: str) -> float | None:
    t = words_to_digits(text)
    if m := re.search(r"(\d+(?:\.\d+)?)\s*(?:cm|centimet)", t):
        return round(float(m.group(1)) / 2.54, 1)
    if m := re.search(r"(\d(?:\.\d+)?)\s*(?:m|meters?|metres?)\b", t):
        return round(float(m.group(1)) * 39.37, 1)
    if m := re.search(r"(\d)\s*(?:'|ft\b|foot|feet)\s*(?:and\s*)?(\d{1,2}(?:\.\d+)?)?", t):
        return float(m.group(1)) * 12 + float(m.group(2) or 0)
    if m := re.search(r"(\d{2,3}(?:\.\d+)?)\s*(?:\"|in\b|inch)", t):
        return float(m.group(1))
    n = _first_number(t)
    if n is None:
        return None
    if 48 <= n <= 90:
        return n
    if 120 <= n <= 230:
        return round(n / 2.54, 1)
    if 4 <= n <= 7:
        return n * 12
    return None


def parse_weight_lb(text: str) -> float | None:
    t = words_to_digits(text)
    n = _first_number(t)
    if n is None:
        return None
    if re.search(r"\b(kg|kilo|kilos|kilograms?)\b", t):
        return round(n * 2.20462, 1)
    return n if 60 <= n <= 800 else None


def parse_age(text: str) -> float | None:
    n = _first_number(words_to_digits(text))
    return n if n is not None and 0 < n < 120 else None


_UNSURE = r"\b(not sure|don'?t know|do not know|unsure|maybe|no idea|can'?t remember|cannot remember|i think|not certain|possibly|might have)\b"
_NO = r"\b(no|nope|nah|never|not|don'?t|haven'?t|hasn'?t|didn'?t|negative)\b"
_YES = r"\b(yes|yeah|yep|yup|correct|i do|i have|i did|sure|uh huh|affirmative|right)\b"


def parse_yes_no(text: str) -> str:
    t = text.lower().replace("-", " ")
    if re.search(_UNSURE, t):
        return "unsure"
    if re.search(_NO, t):
        return "no"
    if re.search(_YES, t):
        return "yes"
    return "unsure"


def bmi(height_in: float, weight_lb: float) -> float:
    return round(703 * weight_lb / (height_in**2), 1)


# ---------------------------------------------------------------- scoring


@dataclass
class AnswerRecord:
    question_id: str
    raw_text: str
    normalized_value: str
    verdict: str  # fit | disqualify | unsure | info


def score_answer(question: Question, raw: str) -> AnswerRecord:
    raw = (raw or "").strip()
    if question.kind == "number":
        n = parse_age(raw)
        if n is None:
            return AnswerRecord(question.id, raw, "", "unsure")
        ok = (question.min is None or n >= question.min) and (question.max is None or n <= question.max)
        return AnswerRecord(question.id, raw, f"{n:g}", "fit" if ok else "disqualify")
    if question.kind == "height":
        n = parse_height_inches(raw)
        return AnswerRecord(question.id, raw, f"{n:g}" if n else "", "info" if n else "unsure")
    if question.kind == "weight":
        n = parse_weight_lb(raw)
        return AnswerRecord(question.id, raw, f"{n:g}" if n else "", "info" if n else "unsure")
    yn = parse_yes_no(raw)
    if yn == "unsure":
        return AnswerRecord(question.id, raw, yn, "unsure")
    if question.role == "disqualify_if_yes":
        return AnswerRecord(question.id, raw, yn, "disqualify" if yn == "yes" else "fit")
    if question.role == "require_yes":
        return AnswerRecord(question.id, raw, yn, "fit" if yn == "yes" else "disqualify")
    if question.role == "comorbidity":
        return AnswerRecord(question.id, raw, yn, "fit" if yn == "yes" else "info")
    return AnswerRecord(question.id, raw, yn, "info")


# ---------------------------------------------------------------- decision

MAX_TRIES_PER_QUESTION = 2


@dataclass
class Decision:
    state: str  # in_progress | fit | not_a_fit | needs_review
    next_question: Question | None = None
    reason: str = ""
    flags: list[str] = field(default_factory=list)
    bmi: float | None = None
    answered: int = 0
    total: int = 0

    @property
    def may_offer_slots(self) -> bool:
        return self.state == "fit"


def _label(qid: str) -> str:
    return qid.replace("_", " ")


def decide(answers: list[AnswerRecord], campaign: Campaign) -> Decision:
    latest: dict[str, AnswerRecord] = {}
    tries: dict[str, int] = {}
    for a in answers:
        latest[a.question_id] = a
        tries[a.question_id] = tries.get(a.question_id, 0) + 1

    def done(state, reason="", **kw):
        return Decision(state=state, reason=reason, **kw)

    # 1. Any hard disqualifier ends the screen.
    for q in campaign.prescreen_questions:
        a = latest.get(q.id)
        if a and a.verdict == "disqualify":
            return done("not_a_fit", f"{_label(q.id)}: answered '{a.raw_text}'")

    # 2. BMI once height and weight are known.
    value = None
    h, w = latest.get("height"), latest.get("weight")
    rules = campaign.bmi_rules
    if h and w and h.normalized_value and w.normalized_value:
        value = bmi(float(h.normalized_value), float(w.normalized_value))
        if value >= rules.fit_max_exclusive or value < rules.comorbidity_min:
            return done("not_a_fit", f"BMI {value} is outside the study range", bmi=value)
        c = latest.get("comorbidity")
        if value < rules.fit_min and c and c.normalized_value == "no":
            return done("not_a_fit", f"BMI {value} needs a weight-related condition; none reported", bmi=value)

    def applies(q: Question) -> bool:
        if q.only_if == "bmi_27_to_30":
            return value is not None and value < rules.fit_min
        return True

    applicable = [q for q in campaign.prescreen_questions if applies(q)]
    flags, needs_review = [], []

    # 3. Next question: first applicable one with no usable answer yet.
    for q in applicable:
        a = latest.get(q.id)
        if a is None:
            return Decision("in_progress", next_question=q, bmi=value, answered=len(latest), total=len(applicable))
        if a.verdict == "unsure":
            if q.kind in ("number", "height", "weight"):
                if tries[q.id] < MAX_TRIES_PER_QUESTION:
                    return Decision("in_progress", next_question=q, bmi=value, answered=len(latest), total=len(applicable))
                return done("needs_review", f"couldn't get a clear {_label(q.id)}", bmi=value)
            if q.unsure_flags:
                flags.append(f"{_label(q.id)}: not sure")
            else:
                needs_review.append(_label(q.id))

    if needs_review:
        return done(
            "needs_review",
            "not sure about: " + ", ".join(needs_review),
            flags=flags,
            bmi=value,
            answered=len(latest),
            total=len(applicable),
        )
    return Decision("fit", flags=flags, bmi=value, answered=len(latest), total=len(applicable))
