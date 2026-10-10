from app.drafter import DraftError, fetch_study, verify_facts

INFO = {"phases": ["PHASE3"], "enrollment": 560, "brief_summary": "A study of fianlimab and cemiplimab in adults."}


def test_verify_facts_keeps_only_quoted_evidence():
    kept, rejected = verify_facts(
        [
            {"fact": "Phase 3", "evidence": "Phase 3"},
            {"fact": "560 people", "evidence": "560"},
            {"fact": "Two drugs", "evidence": "fianlimab and cemiplimab"},
            {"fact": "Paid $500", "evidence": "participants receive $500"},
            {"fact": "Vague", "evidence": "a"},
        ],
        INFO,
    )
    assert [f["fact"] for f in kept] == ["Phase 3", "560 people", "Two drugs"]
    assert [f["fact"] for f in rejected] == ["Paid $500", "Vague"]


def test_bad_nct_id_rejected_without_network():
    try:
        fetch_study("not-an-id")
    except DraftError as exc:
        assert "NCT" in str(exc)
    else:
        raise AssertionError("expected DraftError")
