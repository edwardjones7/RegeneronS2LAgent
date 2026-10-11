import pytest

from app.campaigns import get_campaign
from app.screening import AnswerRecord, bmi, decide, parse_height_inches, parse_weight_lb, score_answer

CAMPAIGN = get_campaign("olatorepatide-nct07685808")


def q(qid):
    return CAMPAIGN.question(qid)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("5 foot 7", 67),
        ("5'7\"", 67),
        ("5 ft 7 in", 67),
        ("five foot seven", 67),
        ("6 feet", 72),
        ("67 inches", 67),
        ("170 cm", 66.9),
        ("1.7 meters", 66.9),
        ("67", 67),
    ],
)
def test_parse_height(text, expected):
    assert parse_height_inches(text) == pytest.approx(expected, abs=0.1)


@pytest.mark.parametrize(
    "text,expected",
    [("220", 220), ("220 pounds", 220), ("about 230 lbs", 230), ("100 kg", 220.5), ("two hundred", 200)],
)
def test_parse_weight(text, expected):
    assert parse_weight_lb(text) == pytest.approx(expected, abs=0.1)


def test_bmi():
    # 5'7", 220 lb -> 34.5
    assert bmi(67, 220) == pytest.approx(34.5, abs=0.1)


@pytest.mark.parametrize(
    "raw,verdict",
    [("yes", "disqualify"), ("Yeah I do", "disqualify"), ("no", "fit"), ("nope", "fit"), ("not sure", "unsure")],
)
def test_score_disqualifier(raw, verdict):
    assert score_answer(q("diabetes"), raw).verdict == verdict


def test_age_under_18_disqualifies():
    assert score_answer(q("age"), "17").verdict == "disqualify"
    assert score_answer(q("age"), "61").verdict == "fit"
    assert score_answer(q("age"), "sixty one").verdict == "fit"


def test_unparseable_height_is_unsure():
    assert score_answer(q("height"), "pretty tall").verdict == "unsure"


ALL_NO = dict(diabetes="no", weight_change="no", bariatric_surgery="no", pancreas_gallbladder="no", thyroid_cancer_history="no")


def rec(qid, raw) -> AnswerRecord:
    return score_answer(q(qid), raw)


def records(**kw):
    return [rec(k, v) for k, v in kw.items()]


def test_start_asks_age_first():
    d = decide([], CAMPAIGN)
    assert d.state == "in_progress"
    assert d.next_question.id == "age"
    assert not d.may_offer_slots


def test_full_fit():
    d = decide(records(age="61", height="5 foot 7", weight="220", **ALL_NO), CAMPAIGN)
    assert d.state == "fit"
    assert d.may_offer_slots
    assert d.next_question is None
    assert d.bmi == pytest.approx(34.5, abs=0.1)


def test_comorbidity_skipped_when_bmi_high_enough():
    d = decide(records(age="61", height="5 foot 7", weight="220"), CAMPAIGN)
    assert d.next_question.id == "diabetes"


def test_comorbidity_asked_when_bmi_27_to_30():
    # 5'7", 185 lb -> BMI 29.0
    d = decide(records(age="40", height="67 inches", weight="185"), CAMPAIGN)
    assert d.next_question.id == "comorbidity"


def test_bmi_27_to_30_without_comorbidity_not_fit():
    d = decide(records(age="40", height="67 inches", weight="185", comorbidity="no"), CAMPAIGN)
    assert d.state == "not_a_fit"
    assert "BMI" in d.reason


def test_bmi_27_to_30_with_comorbidity_continues():
    d = decide(records(age="40", height="67 inches", weight="185", comorbidity="yes"), CAMPAIGN)
    assert d.state == "in_progress"
    assert d.next_question.id == "diabetes"


@pytest.mark.parametrize("weight,state", [("150", "not_a_fit"), ("300", "not_a_fit")])
def test_bmi_out_of_range(weight, state):
    # 5'7": 150 lb -> 23.5 ; 300 lb -> 47.0
    d = decide(records(age="40", height="67", weight=weight), CAMPAIGN)
    assert d.state == state


def test_bmi_boundaries():
    # exactly 45 is out, just under 45 is in (5'7" ~ 286.2 lb -> 44.8)
    assert decide(records(age="40", height="67", weight="286"), CAMPAIGN).state == "in_progress"
    assert decide(records(age="40", height="67", weight="287.5"), CAMPAIGN).state == "not_a_fit"


def test_disqualifier_ends_immediately():
    d = decide(records(age="61", height="67", weight="220", diabetes="yes"), CAMPAIGN)
    assert d.state == "not_a_fit"
    assert "diabetes" in d.reason
    assert d.next_question is None
    assert not d.may_offer_slots


def test_unsure_thyroid_is_flagged_but_fits():
    ans = dict(ALL_NO, thyroid_cancer_history="not sure")
    d = decide(records(age="61", height="67", weight="220", **ans), CAMPAIGN)
    assert d.state == "fit"
    assert any("thyroid" in f for f in d.flags)


def test_unsure_on_hard_question_blocks_and_needs_human():
    ans = dict(ALL_NO, diabetes="not sure")
    d = decide(records(age="61", height="67", weight="220", **ans), CAMPAIGN)
    assert d.state == "needs_review"
    assert not d.may_offer_slots


def test_unparseable_height_is_asked_again_then_needs_review():
    d = decide(records(age="61") + [rec("height", "pretty tall")], CAMPAIGN)
    assert d.next_question.id == "height"
    d = decide(records(age="61") + [rec("height", "pretty tall"), rec("height", "tall-ish")], CAMPAIGN)
    assert d.state == "needs_review"
    assert d.next_question is None


def test_latest_answer_wins():
    d = decide(records(age="61", height="67", weight="220", diabetes="yes") + [rec("diabetes", "no")], CAMPAIGN)
    assert d.state == "in_progress"
