"""Read API for the coordinator dashboard (the source of truth). Protected by X-API-Key."""

import hmac
from statistics import median

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import auth, service
from app.campaigns import all_campaigns, get_campaign
from app.config import get_settings
from app.db import get_session
from app.models import Call, Lead, Note
from app.voice import get_voice

ATTENTION_STATUSES = ("needs_human", "emergency")


def require_api_key(
    x_api_key: str = Header(default=""),
    key: str = Query(default=""),
    cmm_session: str | None = Cookie(default=None),
):
    if auth.valid_session(cmm_session):
        return
    supplied = x_api_key or key
    if not hmac.compare_digest(supplied, get_settings().read_api_key):
        raise HTTPException(401, "bad API key")


router = APIRouter(dependencies=[Depends(require_api_key)])


def _iso(dt):
    return dt.isoformat() + "Z" if dt else None


def lead_summary(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "phone": lead.phone,
        "source": lead.source,
        "status": lead.status,
        "status_reason": lead.status_reason,
        "flags": list({(f["type"], f["detail"]): f for f in lead.flags}.values()),
        "attempts": lead.attempts,
        "created_at": _iso(lead.created_at),
        "seconds_to_first_call": service.seconds_to_first_call(lead),
        "seconds_to_ring": (
            round((lead.calls[0].ringing_at - lead.created_at).total_seconds(), 1)
            if lead.calls and lead.calls[0].ringing_at
            else None
        ),
        "next_attempt_at": _iso(lead.next_attempt_at),
    }


@router.get("/campaigns")
def list_campaigns():
    return [{"id": c.id, "study": c.study_short_name, "nct_id": c.nct_id} for c in all_campaigns().values()]


@router.get("/campaigns/{campaign_id}")
def campaign_overview(campaign_id: str, s: Session = Depends(get_session)):
    c = get_campaign(campaign_id)
    if c is None:
        raise HTTPException(404, "unknown campaign")
    real = (Lead.campaign_id == campaign_id) & (Lead.source != "scorecard")
    counts = dict(s.execute(select(Lead.status, func.count()).where(real).group_by(Lead.status)).all())
    leads = s.scalars(select(Lead).where(real)).all()
    decisions = {l.id: service.current_decision(l) for l in leads}
    speeds = [x for x in (service.seconds_to_first_call(l) for l in leads) if x is not None]
    ring = [
        (c.ringing_at - l.created_at).total_seconds()
        for l in leads
        for c in l.calls[:1]
        if c.ringing_at
    ]
    reached = sum(1 for l in leads if any(call.connected_at for call in l.calls))
    return {
        "campaign": {
            "id": c.id,
            "study_short_name": c.study_short_name,
            "nct_id": c.nct_id,
            "study_url": c.study_url,
            "team_name": c.team_name,
            "coordinator_name": c.coordinator_name,
            "calling_hours": c.calling_hours.model_dump(),
            "timezone": c.timezone,
            "demo_not_irb_approved": c.demo_not_irb_approved,
        },
        "total_leads": len(leads),
        "by_status": counts,
        "median_seconds_to_first_call": median(speeds) if speeds else None,
        "median_seconds_to_ring": round(median(ring), 1) if ring else None,
        "reached": reached,
        "funnel": {
            "opted_in": len(leads),
            "reached": reached,
            "screened": sum(1 for l in leads if decisions[l.id].state in ("fit", "not_a_fit", "needs_review")),
            "looked_like_fit": sum(1 for l in leads if decisions[l.id].state == "fit"),
            "booked": sum(1 for l in leads if l.status == "booked"),
        },
        "needs_attention": [lead_summary(l) for l in leads if l.status in ATTENTION_STATUSES],
    }


@router.get("/calls/live")
def calls_live(campaign_id: str | None = None, practice_id: str | None = None, s: Session = Depends(get_session)):
    from app.live import live_calls

    return live_calls(s, campaign_id, practice_id)


@router.get("/campaigns/{campaign_id}/leads")
def campaign_leads(campaign_id: str, status: str | None = None, s: Session = Depends(get_session)):
    q = select(Lead).where(Lead.campaign_id == campaign_id, Lead.source != "scorecard").order_by(Lead.created_at.desc())
    if status:
        q = q.where(Lead.status == status)
    return [lead_summary(l) for l in s.scalars(q)]


@router.get("/leads/{lead_id}")
def lead_detail(lead_id: int, s: Session = Depends(get_session)):
    lead = s.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "unknown lead")
    campaign = service.campaign_for(lead)
    decision = service.current_decision(lead)
    slot = service.booked_slot(s, lead)
    return {
        **lead_summary(lead),
        "campaign_id": lead.campaign_id,
        "consent": {"given": lead.consent_given, "text": lead.consent_text, "at": _iso(lead.consent_at)},
        "visit": {"slot_id": slot.id, "starts_at_local": slot.starts_at.isoformat()} if slot else None,
        "screening": {
            "state": decision.state,
            "reason": decision.reason,
            "bmi": decision.bmi,
            "flags": decision.flags,
            "answers": [
                {
                    "question_id": a.question_id,
                    "question": (campaign.question(a.question_id).ask if campaign.question(a.question_id) else ""),
                    "criterion": (campaign.question(a.question_id).criterion if campaign.question(a.question_id) else None),
                    "answer": a.raw_text,
                    "normalized": a.normalized_value,
                    "verdict": a.verdict,
                    "at": _iso(a.at),
                }
                for a in lead.answers
            ],
        },
        "calls": [
            {
                "id": c.id,
                "attempt_no": c.attempt_no,
                "conversation_id": c.provider_conversation_id,
                "started_at": _iso(c.started_at),
                "ended_at": _iso(c.ended_at),
                "duration_secs": c.duration_secs,
                "outcome": c.outcome,
                "summary": c.summary,
                "transcript": c.transcript,
                "recording_url": c.recording_url,
            }
            for c in lead.calls
        ],
        "events": [{"at": _iso(e.at), "type": e.type, "detail": e.detail} for e in lead.events],
        "notes": [
            {"at": _iso(n.at), "text": n.text}
            for n in s.scalars(select(Note).where(Note.lead_id == lead.id).order_by(Note.id))
        ],
    }


@router.get("/leads/{lead_id}/calls/{call_id}/recording")
def recording(lead_id: int, call_id: int, s: Session = Depends(get_session)):
    call = s.get(Call, call_id)
    if call is None or call.lead_id != lead_id or not call.provider_conversation_id:
        raise HTTPException(404, "no recording")
    voice = get_voice()
    if not hasattr(voice, "fetch_audio"):
        raise HTTPException(404, "no recording in mock mode")
    return Response(voice.fetch_audio(call.provider_conversation_id), media_type="audio/mpeg")
