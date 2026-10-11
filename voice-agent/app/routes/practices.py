"""Practice outreach API for the office dashboard (and the doctor app's accept button).

Every route is scoped to one practice. Patient data is read through app/ehr.py, which never
queries across practices.
"""

from __future__ import annotations

import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app import ehr, outreach, prescreen, service
from app.config import get_settings
from app.campaigns import get_campaign, phase_label
from app.db import get_session
from app.models import Answer, Call, Event, InboxMessage, Lead, LeadStatus, Note, Slot, TrialAcceptance
from app.routes.read_api import _iso, lead_summary, require_api_key

router = APIRouter(dependencies=[Depends(require_api_key)])


def _practice(practice_id: str) -> dict:
    p = next((x for x in ehr.list_practices() if x["id"] == practice_id), None)
    if p is None:
        raise HTTPException(404, "unknown practice")
    return p


def _lead(s: Session, lead_id: int) -> Lead:
    lead = s.get(Lead, lead_id)
    if lead is None or not lead.practice_id:
        raise HTTPException(404, "unknown patient outreach")
    return lead


@router.get("/practices")
def practices():
    """All practices, with patient counts only (counts under 5 are suppressed)."""
    return ehr.list_practices()


class ProfileIn(BaseModel):
    doctor_name: str | None = None
    address: str | None = None
    callback_phone: str | None = None
    staff_phone: str | None = None


def _profile_out(p) -> dict:
    return {"practice_id": p.practice_id, "name": p.name, "doctor_name": p.doctor_name, "address": p.address,
            "callback_phone": p.callback_phone, "staff_phone": p.staff_phone, "timezone": p.timezone,
            "office_display": outreach.office_display(p)}


@router.get("/practices/{practice_id}/profile")
def get_profile(practice_id: str, s: Session = Depends(get_session)):
    _practice(practice_id)
    return _profile_out(outreach.profile(s, practice_id))


@router.put("/practices/{practice_id}/profile")
def put_profile(practice_id: str, body: ProfileIn, s: Session = Depends(get_session)):
    _practice(practice_id)
    p = outreach.profile(s, practice_id)
    if body.doctor_name is not None:
        p.doctor_name = outreach.clean_doctor_name(body.doctor_name)
    for field in ("address", "callback_phone", "staff_phone"):
        value = getattr(body, field)
        if value is not None:
            setattr(p, field, service.normalize_phone(value) if field.endswith("phone") and value.strip() else value.strip())
    return _profile_out(p)


@router.get("/practices/{practice_id}/trials")
def trials(practice_id: str, s: Session = Depends(get_session)):
    """The trials this practice could run, with its pre-screen counts, and whether it accepted them.

    Trials the matching engine has results for at this practice (view prescreen_trial_counts),
    plus the hand-authored protocols (the offline fallback). Emits aggregate counts only."""
    _practice(practice_id)
    accepted = {a.nct_id: a for a in s.scalars(select(TrialAcceptance).where(TrialAcceptance.practice_id == practice_id))}
    stored = ehr.prescreen_trial_counts(practice_id) or {}
    protos = prescreen.protocols()
    ids = list(dict.fromkeys([*stored, *protos]))
    registry = ehr.trials(ids)
    out = []
    for nct_id in ids:
        proto, row = protos.get(nct_id) or {}, registry.get(nct_id) or {}
        c = stored.get(nct_id) or prescreen.counts(practice_id, nct_id)
        a = accepted.get(nct_id)
        out.append({
            "nct_id": nct_id,
            "title": row.get("brief_title") or proto.get("shortTitle") or nct_id,
            "official_title": row.get("official_title") or proto.get("title") or row.get("brief_title"),
            "sponsor": row.get("lead_sponsor") or proto.get("sponsor"),
            "phase": phase_label(row.get("phases")) or proto.get("phase"),
            "url": proto.get("url") or f"https://clinicaltrials.gov/study/{nct_id}",
            # A call script exists, or the registry row is there to build one on accept.
            "callable": get_campaign(outreach.campaign_id_for(nct_id)) is not None or bool(row),
            "candidates": c["candidate"],
            "chart_review": c["chart_review"],
            "accepted": a is not None,
            "acceptance_id": a.id if a else None,
            "accepted_by": a.accepted_by if a else None,
            "accepted_at": _iso(a.accepted_at) if a else None,
        })
    return sorted(out, key=lambda t: (-t["candidates"], -t["chart_review"]))


class AcceptIn(BaseModel):
    doctor_name: str = ""


@router.post("/practices/{practice_id}/trials/{nct_id}/accept")
def accept(practice_id: str, nct_id: str, body: AcceptIn, s: Session = Depends(get_session)):
    """The doctor said yes. Calls to the pre-screen candidates start automatically."""
    _practice(practice_id)
    try:
        a = outreach.accept_trial(s, practice_id, nct_id, body.doctor_name)
    except outreach.OutreachError as exc:
        raise HTTPException(400, str(exc)) from exc
    result = {"acceptance_id": a.id, "candidates": a.candidates, "chart_review": a.chart_review, "accepted_by": a.accepted_by}
    s.commit()
    if get_settings().vercel:
        # Serverless has no background worker (Vercel Cron only runs daily), so start the first
        # batch of calls now instead of waiting for the next cron tick.
        _tick(force=True)
    return result


_last_tick = 0.0
TICK_EVERY_SECS = 15


def _tick(force: bool = False) -> None:
    """On Vercel, advance the call queue (dial due leads, settle calls, resolve simulations).
    Runs on accept so the first calls go out immediately; after that an external scheduler
    hitting /cron/tick (deploy/pi-cron) keeps the queue moving."""
    global _last_tick
    if not force and time.monotonic() - _last_tick < TICK_EVERY_SECS:
        return
    _last_tick = time.monotonic()
    from app.main import worker_tick  # main imports this module; import lazily

    try:
        worker_tick()
    except Exception:  # never fail the request the doctor is waiting on
        import logging

        logging.getLogger(__name__).exception("inline worker tick failed")


STAGES = {
    "queued": "Queued", "calling": "Calling", "no_answer": "Trying again", "booked": "Booked",
    "needs_human": "Needs staff", "chart_review": "Chart review", "not_a_fit": "Office follow-up",
    "closed": "Not interested", "opted_out": "Opted out", "dropped": "Dropped", "emergency": "Emergency",
}


@router.get("/practices/{practice_id}/outreach")
def outreach_overview(practice_id: str, nct_id: str | None = None, s: Session = Depends(get_session)):
    """Everything the staff dashboard shows for one practice (optionally one trial)."""
    _practice(practice_id)
    q = select(Lead).where(Lead.practice_id == practice_id)
    if nct_id:
        q = q.where(Lead.campaign_id == outreach.campaign_id_for(nct_id))
    leads = list(s.scalars(q.order_by(Lead.id)))
    by_status: dict[str, int] = {}
    for x in leads:
        by_status[x.status] = by_status.get(x.status, 0) + 1
    reached = sum(1 for x in leads if any(c.connected_at for c in x.calls))
    texted = sum(1 for x in leads if any(e.type == "slots_offered" for e in x.events))
    return {
        "practice": _profile_out(outreach.profile(s, practice_id)),
        "totals": {
            "patients": len(leads),
            "called": sum(1 for x in leads if x.attempts),
            "reached": reached,
            "texted": texted,
            "booked": by_status.get("booked", 0),
            "needs_staff": by_status.get("needs_human", 0) + by_status.get("emergency", 0),
            "chart_review": by_status.get("chart_review", 0),
            "in_progress": by_status.get("calling", 0),
        },
        "by_status": by_status,
        "stages": STAGES,
        "patients": [_outreach_row(x) for x in leads],
    }


def _outreach_row(lead: Lead) -> dict:
    last = max(lead.events, key=lambda e: e.id, default=None)
    return {
        **lead_summary(lead),
        "practice_id": lead.practice_id,
        "patient_id": lead.patient_id,
        "nct_id": (get_campaign(lead.campaign_id).nct_id if get_campaign(lead.campaign_id) else None),
        "simulated": bool(lead.simulated),
        "identity_verified": bool(lead.identity_verified),
        "call_window": lead.call_window,
        "last_activity": {"type": last.type, "at": _iso(last.at)} if last else None,
        "texts": sum(1 for e in lead.events if e.type == "sms_sent" and e.detail.get("to") == "patient"),
        "inbound_calls": sum(1 for c in lead.calls if c.direction == "inbound"),
        # Test patients only (a teammate's real phone): the birth date they'll be asked to confirm.
        "test_birth_date": lead.birth_date if not lead.simulated else None,
    }


@router.post("/leads/{lead_id}/clear")
def clear(lead_id: int, s: Session = Depends(get_session)):
    """Staff checked the chart: start calling this patient."""
    try:
        outreach.clear_chart_review(s, _lead(s, lead_id))
    except outreach.OutreachError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


class Reason(BaseModel):
    reason: str = ""


@router.post("/leads/{lead_id}/drop")
def drop(lead_id: int, body: Reason, s: Session = Depends(get_session)):
    outreach.drop(s, _lead(s, lead_id), body.reason)
    return {"ok": True}


@router.post("/leads/{lead_id}/contacted")
def mark_contacted(lead_id: int, body: Reason, s: Session = Depends(get_session)):
    """Staff reached the patient themselves."""
    lead = _lead(s, lead_id)
    lead.next_attempt_at = None
    service.log_event(s, lead, "staff_contacted", note=body.reason[:500])
    service.set_status(s, lead, LeadStatus.CLOSED, f"contacted by staff{': ' + body.reason if body.reason else ''}")
    return {"ok": True}


@router.post("/leads/{lead_id}/restart")
def restart(lead_id: int, s: Session = Depends(get_session)):
    """Staff want Ava to try again: a fresh 3-try sequence, starting now."""
    lead = _lead(s, lead_id)
    if lead.status in (LeadStatus.OPTED_OUT, LeadStatus.BOOKED):
        raise HTTPException(400, f"can't restart a patient who is {lead.status}")
    lead.attempts = 0
    lead.next_attempt_at = outreach.next_calling_time(lead, service.utcnow())
    service.log_event(s, lead, "sequence_restarted")
    lead.status = LeadStatus.QUEUED  # direct: staff override any final status except the ones above
    lead.status_reason = "restarted by office staff"
    return {"ok": True}


@router.post("/practices/{practice_id}/reset")
def reset(practice_id: str, nct_id: str | None = None, s: Session = Depends(get_session)):
    """Wipe this practice's outreach, for one trial or all of them: its patients, calls, texts,
    answers and history, the visits they booked, and the acceptances, so the trials can be accepted
    again from scratch. The do-not-call list is kept."""
    _practice(practice_id)
    q = select(Lead.id).where(Lead.practice_id == practice_id)
    if nct_id:
        q = q.where(Lead.campaign_id == outreach.campaign_id_for(nct_id))
    ids = list(s.scalars(q))
    if ids:
        s.execute(update(Slot).where(Slot.booked_lead_id.in_(ids)).values(booked_lead_id=None))
        s.execute(update(Slot).where(Slot.held_by_lead_id.in_(ids)).values(held_by_lead_id=None, held_until=None))
        for model in (Call, Answer, Event, Note):
            s.execute(delete(model).where(model.lead_id.in_(ids)))
        s.execute(delete(Lead).where(Lead.id.in_(ids)))
    acc = delete(TrialAcceptance).where(TrialAcceptance.practice_id == practice_id)
    if nct_id:
        acc = acc.where(TrialAcceptance.nct_id == nct_id)
    trials = s.execute(acc).rowcount
    s.expunge_all()
    return {"ok": True, "patients": len(ids), "trials": trials}


@router.get("/inbox")
def inbox(s: Session = Depends(get_session)):
    """Messages from callers and texters we couldn't match to a patient."""
    rows = s.scalars(select(InboxMessage).order_by(InboxMessage.id.desc()).limit(100))
    return [{"id": m.id, "at": _iso(m.at), "channel": m.channel, "from_phone": m.from_phone, "name": m.name,
             "text": m.text, "resolved": m.resolved} for m in rows]


@router.post("/inbox/{message_id}/resolve")
def resolve_message(message_id: int, s: Session = Depends(get_session)):
    m = s.get(InboxMessage, message_id)
    if m is None:
        raise HTTPException(404, "unknown message")
    m.resolved = True
    return {"ok": True}


@router.get("/practices/{practice_id}/calls/live")
def live(practice_id: str, s: Session = Depends(get_session)):
    """Calls in progress at this practice (real and simulated)."""
    rows = s.scalars(
        select(Call).join(Lead).where(Lead.practice_id == practice_id, Call.ended_at.is_(None)).order_by(Call.id.desc())
    ).all()
    return [{"call_id": c.id, "lead_id": c.lead_id, "first_name": c.lead.first_name, "last_name": c.lead.last_name,
             "direction": c.direction or "outbound", "simulated": bool(c.lead.simulated), "started_at": _iso(c.started_at),
             "attempt": c.attempt_no} for c in rows]


@router.get("/practices/{practice_id}/patients/{patient_id}/outreach")
def patient_outreach(practice_id: str, patient_id: str, s: Session = Depends(get_session)):
    """One patient's outreach at this practice: one entry per trial they're being contacted about."""
    _practice(practice_id)
    leads = s.scalars(
        select(Lead).where(Lead.practice_id == practice_id, Lead.patient_id == patient_id).order_by(Lead.id)
    ).all()
    out = []
    for lead in leads:
        slot = service.booked_slot(s, lead)
        campaign = get_campaign(lead.campaign_id)
        timeline = [
            {"at": _iso(e.at), "type": e.type, "body": e.detail.get("body") if e.type in ("sms_sent", "sms_received") else None,
             "to": e.detail.get("to")}
            for e in lead.events
            if e.type in ("call_started", "call_ended", "sms_sent", "sms_received", "visit_booked", "visit_confirmed",
                          "visit_rescheduled", "identity_verified", "inbound_call", "call_window_set", "staff_contacted",
                          "chart_review_cleared")
            and (e.type not in ("sms_sent",) or e.detail.get("to") == "patient")
        ]
        out.append({
            **_outreach_row(lead),
            "trial_title": campaign.study_short_name if campaign else None,
            "visit": slot.starts_at.isoformat() if slot else None,
            "timeline": timeline,
        })
    return out


@router.get("/practices/{practice_id}/calendar")
def calendar(practice_id: str, start: str | None = None, days: int = 7, s: Session = Depends(get_session)):
    """The practice's visit calendar for a week: every visit time, open or booked (and by whom).

    `start` is a local date (YYYY-MM-DD), default today. One calendar per practice, shared by trials.
    """
    from datetime import date, datetime, timedelta

    from app import slots as visit_slots
    from app.models import Slot

    _practice(practice_id)
    prof = outreach.profile(s, practice_id)
    first = date.fromisoformat(start) if start else date.today()
    days = max(1, min(days, 14))
    visit_slots.ensure_practice_calendar(s, practice_id, prof.timezone)
    lo, hi = datetime.combine(first, datetime.min.time()), datetime.combine(first + timedelta(days=days), datetime.min.time())
    rows = s.scalars(
        select(Slot).where(Slot.practice_id == practice_id, Slot.starts_at >= lo, Slot.starts_at < hi).order_by(Slot.starts_at)
    ).all()
    out, seen = [], set()
    for sl in rows:
        lead = s.get(Lead, sl.booked_lead_id) if sl.booked_lead_id else None
        if sl.starts_at in seen and not lead:
            continue  # an older per-trial slot at the same time: show one open cell
        seen.add(sl.starts_at)
        campaign = get_campaign(lead.campaign_id) if lead else None
        recorded = next((c for c in reversed(lead.calls) if c.recording_url), None) if lead else None
        out.append({
            "slot_id": sl.id,
            "starts_at_local": sl.starts_at.isoformat(),
            "minutes": 60,
            "booked": {
                "lead_id": lead.id,
                "patient_id": lead.patient_id,
                "name": f"{lead.first_name} {lead.last_name}".strip(),
                "trial": campaign.study_short_name if campaign else None,
                "status": lead.status,
                "booked_by": "text" if any(e.type == "visit_booked" and e.detail.get("via") == "sms" for e in lead.events) else "Ava",
                "nct_id": campaign.nct_id if campaign else None,
                "booked_at": next((_iso(e.at) for e in reversed(lead.events) if e.type in ("visit_booked", "visit_rescheduled")), None),
                "recording_call_id": recorded.id if recorded else None,
                "simulated": bool(lead.simulated),
            } if lead else None,
        })
    return {"start": first.isoformat(), "days": days, "timezone": prof.timezone, "slots": out}



ACTIVITY_TYPES = ("visit_booked", "visit_rescheduled", "visit_cancelled", "callback_requested", "inbound_call",
                  "call_window_set", "staff_contacted", "sms_received", "status")


def _activity_text(e, name: str) -> str | None:
    from app.slots import short

    first = name.split(" ")[0]
    d = e.detail or {}
    if e.type in ("visit_booked", "visit_rescheduled"):
        when = d.get("starts_at")
        when_txt = short(datetime.fromisoformat(when)) if when else "a visit"
        verb = "Rescheduled" if e.type == "visit_rescheduled" else "Booked"
        via = " from a text" if d.get("via") == "sms" else ""
        return f"{verb} {name} for {when_txt}{via}"
    if e.type == "visit_cancelled":
        return f"{name} cancelled their visit"
    if e.type == "callback_requested":
        return f"Missed {first}, texted them to call back"
    if e.type == "inbound_call":
        return f"{name} called the office back"
    if e.type == "call_window_set":
        return f"{first} asked to be called {d.get('window', 'later')}"
    if e.type == "staff_contacted":
        return f"Staff reached {name}"
    if e.type == "sms_received":
        return f"{first} texted the office"
    if e.type == "status" and d.get("status") == "needs_human":
        return f"Handed {name} to the office: {d.get('reason', '')}".rstrip(": ")
    return None


@router.get("/practices/{practice_id}/activity")
def activity(practice_id: str, limit: int = 12, s: Session = Depends(get_session)):
    """What Ava is doing right now at this practice, and the latest things that happened, in plain words."""
    from app.models import Event

    _practice(practice_id)
    on_call = s.scalars(
        select(Call).join(Lead).where(Lead.practice_id == practice_id, Call.ended_at.is_(None)).order_by(Call.id.desc())
    ).all()
    events = s.execute(
        select(Event, Lead).join(Lead, Lead.id == Event.lead_id)
        .where(Lead.practice_id == practice_id, Event.type.in_(ACTIVITY_TYPES))
        .order_by(Event.id.desc()).limit(limit * 4)
    ).all()
    recent = []
    for e, lead in events:
        text = _activity_text(e, f"{lead.first_name} {lead.last_name}".strip())
        if text:
            recent.append({"at": _iso(e.at), "type": e.type, "text": text, "lead_id": lead.id, "patient_id": lead.patient_id})
        if len(recent) >= limit:
            break
    return {
        "on_call": [{"lead_id": c.lead_id, "name": f"{c.lead.first_name} {c.lead.last_name}".strip(),
                     "direction": c.direction or "outbound", "simulated": bool(c.lead.simulated)} for c in on_call],
        "recent": recent,
    }
