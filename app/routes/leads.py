"""Lead intake: an ad form / CRM webhook posts here and the call starts within seconds."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import service
from app.config import get_settings
from app.db import get_session

router = APIRouter()


class LeadIn(BaseModel):
    campaign_id: str
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = ""
    phone: str
    consent_given: bool
    consent_text: str = ""
    source: str = "web_form"
    timezone: str | None = None


@router.post("/leads", status_code=201)
def create_lead(body: LeadIn, background: BackgroundTasks, s: Session = Depends(get_session)):
    try:
        lead, dial_now = service.create_lead(s, **body.model_dump())
    except service.LeadError as exc:
        raise HTTPException(400, str(exc)) from exc
    s.commit()
    if dial_now:
        if get_settings().vercel:
            service.dial(lead.id)  # serverless: work after the response isn't guaranteed
        else:
            # Runs right after the response is sent, so the form submit never waits on the phone.
            background.add_task(service.dial, lead.id)
    return {"lead_id": lead.id, "status": "calling" if dial_now else lead.status, "reason": lead.status_reason}
