"""Coordinator actions from the dashboard, plus demo scenarios and the persona scorecard.

Same auth as the read API (session cookie or X-API-Key). Bodies are JSON, and the session
cookie is SameSite=Lax, so cross-site form posts can't trigger these.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import service, slots
from app.campaigns import get_campaign
from app.db import get_session
from app.models import Lead, LeadStatus, Note, ScorecardRun, Slot
from app.routes.read_api import require_api_key

router = APIRouter(dependencies=[Depends(require_api_key)])


def _lead(s: Session, lead_id: int) -> Lead:
    lead = s.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "unknown lead")
    return lead


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ResolveIn(BaseModel):
    note: str = ""


class RescheduleIn(BaseModel):
    slot_id: int


@router.post("/leads/{lead_id}/notes")
def add_note(lead_id: int, body: NoteIn, s: Session = Depends(get_session)):
    lead = _lead(s, lead_id)
    s.add(Note(lead_id=lead.id, text=body.text.strip()))
    service.log_event(s, lead, "note_added", text=body.text.strip()[:200])
    return {"ok": True}


@router.post("/leads/{lead_id}/resolve")
def resolve(lead_id: int, body: ResolveIn, s: Session = Depends(get_session)):
    """Coordinator handled it: flags are marked resolved and the lead leaves the attention queue."""
    lead = _lead(s, lead_id)
    lead.flags = [{**f, "resolved": True} for f in lead.flags]
    if body.note.strip():
        s.add(Note(lead_id=lead.id, text=body.note.strip()))
    if lead.status in (LeadStatus.NEEDS_HUMAN, LeadStatus.EMERGENCY):
        lead.status = LeadStatus.CLOSED  # direct: resolving is the one way out of emergency
        lead.status_reason = "resolved by coordinator"
    service.log_event(s, lead, "resolved", note=body.note.strip()[:200])
    return {"ok": True, "status": lead.status}


@router.post("/leads/{lead_id}/call-again")
def call_again(lead_id: int, background: BackgroundTasks, s: Session = Depends(get_session)):
    lead = _lead(s, lead_id)
    if lead.status == LeadStatus.OPTED_OUT or service.is_suppressed(s, lead.phone):
        raise HTTPException(409, "This person asked not to be called.")
    if lead.status == LeadStatus.CALLING:
        raise HTTPException(409, "A call is already in progress.")
    lead.status = LeadStatus.NEW
    lead.next_attempt_at = None
    service.log_event(s, lead, "callback_requested_by_coordinator")
    s.commit()
    background.add_task(service.dial, lead.id)
    return {"ok": True}


@router.post("/leads/{lead_id}/cancel-visit")
def cancel_visit(lead_id: int, s: Session = Depends(get_session)):
    lead = _lead(s, lead_id)
    slot = service.booked_slot(s, lead)
    if slot is None:
        raise HTTPException(409, "No visit booked.")
    campaign = service.campaign_for(lead)
    when = slots.short(slot.starts_at)
    slot.booked_lead_id = None
    service.set_status(s, lead, LeadStatus.CLOSED, "visit cancelled by coordinator")
    lead.status = LeadStatus.CLOSED
    body = (f"Hi {lead.first_name}, your {when} visit with {campaign.team_name} has been cancelled. "
            f"Questions? Call {campaign.clinic_phone}.")
    service.send_sms_logged(s, lead, lead.phone, body, "patient")
    service.log_event(s, lead, "visit_cancelled", starts_at=slot.starts_at.isoformat())
    return {"ok": True}


@router.post("/leads/{lead_id}/reschedule")
def reschedule(lead_id: int, body: RescheduleIn, s: Session = Depends(get_session)):
    lead = _lead(s, lead_id)
    old = service.booked_slot(s, lead)
    new = s.get(Slot, body.slot_id)
    if new is None or new.campaign_id != lead.campaign_id:
        raise HTTPException(404, "unknown slot")
    if not slots.book(s, new.id, lead.id):
        raise HTTPException(409, "That time was just taken.")
    if old:
        old.booked_lead_id = None
    s.refresh(new)
    lead.status = LeadStatus.BOOKED
    lead.status_reason = f"visit {new.starts_at.isoformat()}"
    campaign = service.campaign_for(lead)
    text = (f"Hi {lead.first_name}, your visit with {campaign.team_name} is now {slots.short(new.starts_at)}, "
            f"{campaign.clinic_address}. Questions? Call {campaign.clinic_phone}.")
    service.send_sms_logged(s, lead, lead.phone, text, "patient")
    service.log_event(s, lead, "visit_rescheduled", starts_at=new.starts_at.isoformat())
    return {"ok": True}


@router.get("/campaigns/{campaign_id}/slots")
def open_slots(campaign_id: str, s: Session = Depends(get_session)):
    c = get_campaign(campaign_id)
    if c is None:
        raise HTTPException(404, "unknown campaign")
    found = slots.open_slots(s, c, n=12) or (slots.seed_slots(s, c) and slots.open_slots(s, c, n=12))
    return [{"id": sl.id, "starts_at_local": sl.starts_at.isoformat(), "label": slots.spoken(sl.starts_at)} for sl in found or []]


@router.get("/campaigns/{campaign_id}/visits")
def visits(campaign_id: str, s: Session = Depends(get_session)):
    rows = s.execute(
        select(Slot, Lead).join(Lead, Lead.id == Slot.booked_lead_id).where(Slot.campaign_id == campaign_id).order_by(Slot.starts_at)
    ).all()
    return [
        {"slot_id": sl.id, "starts_at_local": sl.starts_at.isoformat(), "lead_id": l.id, "first_name": l.first_name,
         "last_name": l.last_name, "phone": l.phone, "status": l.status}
        for sl, l in rows
    ]


# ---------------------------------------------------------------- demo scenarios + scorecard


@router.get("/simulate/personas")
def personas():
    from app.simulate import PERSONAS

    return [{"id": p.id, "label": p.label, "brief": p.brief} for p in PERSONAS.values()]


@router.post("/simulate/{persona_id}")
def run_persona(persona_id: str):
    from app.simulate import PERSONAS, start_scenario

    if persona_id not in PERSONAS:
        raise HTTPException(404, "unknown persona")
    return {"lead_id": start_scenario(persona_id)}


@router.post("/scorecard/run")
def scorecard_run():
    from app.simulate import run_scorecard

    return run_scorecard()


@router.get("/scorecard/latest")
def scorecard_latest(s: Session = Depends(get_session)):
    run = s.scalars(select(ScorecardRun).order_by(ScorecardRun.id.desc())).first()
    if run is None:
        return None
    return {"id": run.id, "status": run.status, "started_at": run.started_at.isoformat() + "Z",
            "finished_at": run.finished_at.isoformat() + "Z" if run.finished_at else None, "results": run.results}
