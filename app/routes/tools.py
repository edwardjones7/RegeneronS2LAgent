"""Endpoints the voice agent calls mid-conversation (ElevenLabs server tools).

Every response is {"result": "<plain sentence the agent acts on>"}.
`lead_id` is injected by ElevenLabs from a dynamic variable; the LLM never supplies it.
"""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import service
from app.config import get_settings
from app.db import get_session
from app.models import Lead

router = APIRouter(prefix="/tools")


def require_tool_secret(x_tool_secret: str = Header(default="")):
    if not hmac.compare_digest(x_tool_secret, get_settings().tool_secret):
        raise HTTPException(401, "bad tool secret")


def _lead(s: Session, lead_id: str) -> Lead:
    try:
        lead = s.get(Lead, int(lead_id))
    except (TypeError, ValueError):
        lead = None
    if lead is None:
        raise HTTPException(404, "unknown lead")
    return lead


class Base(BaseModel):
    lead_id: str


class RecordAnswer(Base):
    question_id: str
    answer: str


class BookVisit(Base):
    slot_id: int


class Reason(Base):
    reason: str = ""


class Emergency(Base):
    what_they_said: str = ""


deps = [Depends(require_tool_secret)]


@router.post("/record_answer", dependencies=deps)
def record_answer(body: RecordAnswer, s: Session = Depends(get_session)):
    return {"result": service.tool_record_answer(s, _lead(s, body.lead_id), body.question_id, body.answer)}


@router.post("/get_open_slots", dependencies=deps)
def get_open_slots(body: Base, s: Session = Depends(get_session)):
    return {"result": service.tool_get_open_slots(s, _lead(s, body.lead_id))}


@router.post("/book_visit", dependencies=deps)
def book_visit(body: BookVisit, s: Session = Depends(get_session)):
    return {"result": service.tool_book_visit(s, _lead(s, body.lead_id), body.slot_id)}


@router.post("/opt_out", dependencies=deps)
def opt_out(body: Reason, s: Session = Depends(get_session)):
    return {"result": service.tool_opt_out(s, _lead(s, body.lead_id), body.reason)}


@router.post("/mark_not_interested", dependencies=deps)
def not_interested(body: Reason, s: Session = Depends(get_session)):
    return {"result": service.tool_not_interested(s, _lead(s, body.lead_id), body.reason)}


@router.post("/escalate_to_human", dependencies=deps)
def escalate(body: Reason, s: Session = Depends(get_session)):
    return {"result": service.tool_escalate(s, _lead(s, body.lead_id), body.reason or "requested a person")}


@router.post("/flag_emergency", dependencies=deps)
def flag_emergency(body: Emergency, s: Session = Depends(get_session)):
    return {"result": service.tool_flag_emergency(s, _lead(s, body.lead_id), body.what_they_said)}
