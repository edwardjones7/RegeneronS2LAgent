"""Tables. Everything the coordinator dashboard will show lives here."""

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class LeadStatus(StrEnum):
    NEW = "new"
    QUEUED = "queued"  # waiting for calling hours
    CALLING = "calling"
    BOOKED = "booked"
    NOT_A_FIT = "not_a_fit"
    NO_ANSWER = "no_answer"  # retry scheduled
    NEEDS_HUMAN = "needs_human"
    OPTED_OUT = "opted_out"
    EMERGENCY = "emergency"
    CLOSED = "closed"


# Statuses where the agent's work on a lead is finished; nothing may overwrite them
# except an emergency or an opt-out.
FINAL_STATUSES = {
    LeadStatus.BOOKED,
    LeadStatus.NOT_A_FIT,
    LeadStatus.OPTED_OUT,
    LeadStatus.EMERGENCY,
    LeadStatus.CLOSED,
}


class Lead(Base):
    __tablename__ = "lead"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String(100), index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[str] = mapped_column(String(20), index=True)  # E.164
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(100), default="web_form")
    consent_given: Mapped[bool] = mapped_column(default=False)
    consent_text: Mapped[str] = mapped_column(Text, default="")
    consent_at: Mapped[datetime] = mapped_column(default=utcnow)
    status: Mapped[str] = mapped_column(String(20), default=LeadStatus.NEW, index=True)
    status_reason: Mapped[str] = mapped_column(Text, default="")
    flags: Mapped[list] = mapped_column(JSON, default=list)
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    calls: Mapped[list["Call"]] = relationship(back_populates="lead", order_by="Call.id")
    answers: Mapped[list["Answer"]] = relationship(back_populates="lead", order_by="Answer.id")
    events: Mapped[list["Event"]] = relationship(back_populates="lead", order_by="Event.id")


class Call(Base):
    __tablename__ = "call"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("lead.id"), index=True)
    attempt_no: Mapped[int] = mapped_column(default=1)
    provider_conversation_id: Mapped[str | None] = mapped_column(String(100), index=True)
    provider_call_sid: Mapped[str | None] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    connected_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    duration_secs: Mapped[int | None] = mapped_column(nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    transcript: Mapped[list] = mapped_column(JSON, default=list)
    recording_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    lead: Mapped[Lead] = relationship(back_populates="calls")


class Answer(Base):
    __tablename__ = "answer"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("lead.id"), index=True)
    question_id: Mapped[str] = mapped_column(String(50))
    raw_text: Mapped[str] = mapped_column(Text)
    normalized_value: Mapped[str] = mapped_column(String(100), default="")
    verdict: Mapped[str] = mapped_column(String(20))  # fit | disqualify | unsure | info
    at: Mapped[datetime] = mapped_column(default=utcnow)

    lead: Mapped[Lead] = relationship(back_populates="answers")


class Slot(Base):
    __tablename__ = "slot"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String(100), index=True)
    starts_at: Mapped[datetime]  # naive, in the campaign's local timezone
    booked_lead_id: Mapped[int | None] = mapped_column(ForeignKey("lead.id"), nullable=True)


class Event(Base):
    __tablename__ = "event"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("lead.id"), index=True)
    at: Mapped[datetime] = mapped_column(default=utcnow)
    type: Mapped[str] = mapped_column(String(50))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)

    lead: Mapped[Lead] = relationship(back_populates="events")


class Suppression(Base):
    """Numbers that asked not to be called. Checked before every dial, across all campaigns."""

    __tablename__ = "suppression"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(default=utcnow)
