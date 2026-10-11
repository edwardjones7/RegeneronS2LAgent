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
    # Practice outreach: pre-screened, but a criterion needs a person to check the chart
    # before anyone calls. Staff clear it (-> queued) or drop it.
    CHART_REVIEW = "chart_review"
    DROPPED = "dropped"  # staff decided to stop outreach


# Statuses where the agent's work on a lead is finished; nothing may overwrite them
# except an emergency or an opt-out.
FINAL_STATUSES = {
    LeadStatus.BOOKED,
    LeadStatus.NOT_A_FIT,
    LeadStatus.OPTED_OUT,
    LeadStatus.EMERGENCY,
    LeadStatus.CLOSED,
    LeadStatus.DROPPED,
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

    # Practice outreach (a doctor accepted a trial; this lead is one of their pre-screened patients).
    # Empty for leads from the old ad opt-in flow.
    practice_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    patient_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    acceptance_id: Mapped[int | None] = mapped_column(ForeignKey("trial_acceptance.id"), nullable=True, index=True)
    # Kept server-side only, to check identity. Never sent to the voice agent or its LLM.
    birth_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    identity_verified: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    # One pre-written sentence ("you were in to see Dr. X back in March"); shared only after verification.
    personal_touch: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Demo: no real phone number, so calls and replies are simulated.
    simulated: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    # Patient's stated preference, e.g. "after 17:00", "morning", "afternoon", "evening".
    call_window: Mapped[str | None] = mapped_column(String(40), nullable=True)

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
    # Observed from Twilio while the call is live: when the phone started ringing / was answered.
    ringing_at: Mapped[datetime | None] = mapped_column(nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(nullable=True)
    telephony_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    duration_secs: Mapped[int | None] = mapped_column(nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    transcript: Mapped[list] = mapped_column(JSON, default=list)
    recording_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(10), default="outbound", nullable=True)  # outbound | inbound

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
    practice_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    booked_lead_id: Mapped[int | None] = mapped_column(ForeignKey("lead.id"), nullable=True)


class Event(Base):
    __tablename__ = "event"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("lead.id"), index=True)
    at: Mapped[datetime] = mapped_column(default=utcnow)
    type: Mapped[str] = mapped_column(String(50))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)

    lead: Mapped[Lead] = relationship(back_populates="events")


class CampaignRecord(Base):
    """A campaign drafted from ClinicalTrials.gov and approved in the dashboard."""

    __tablename__ = "campaign"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    approved_by_note: Mapped[str] = mapped_column(Text, default="")


class ScorecardRun(Base):
    """One run of the persona suite against the live agent, with graded results."""

    __tablename__ = "scorecard_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running")
    results: Mapped[list] = mapped_column(JSON, default=list)


class Note(Base):
    """Coordinator note on a lead."""

    __tablename__ = "note"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("lead.id"), index=True)
    at: Mapped[datetime] = mapped_column(default=utcnow)
    text: Mapped[str] = mapped_column(Text)


class Suppression(Base):
    """Numbers that asked not to be called. Checked before every dial, across all campaigns."""

    __tablename__ = "suppression"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(default=utcnow)


class PracticeProfile(Base):
    """How a practice appears to its patients: who's calling, where visits happen, who staff are.

    Practices come from the EHR stand-in (Supabase `practices`). Nothing here is invented: the
    doctor's name is the accepting doctor's own, and the address is a labeled demo address.
    """

    __tablename__ = "practice_profile"

    practice_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    doctor_name: Mapped[str] = mapped_column(String(200), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    callback_phone: Mapped[str] = mapped_column(String(20), default="")
    staff_phone: Mapped[str] = mapped_column(String(20), default="")
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York")


class TrialAcceptance(Base):
    """A doctor said yes to a trial. Outreach to that practice's candidates starts from here."""

    __tablename__ = "trial_acceptance"

    id: Mapped[int] = mapped_column(primary_key=True)
    practice_id: Mapped[str] = mapped_column(String(64), index=True)
    nct_id: Mapped[str] = mapped_column(String(20))
    campaign_id: Mapped[str] = mapped_column(String(100))
    accepted_by: Mapped[str] = mapped_column(String(200))
    accepted_at: Mapped[datetime] = mapped_column(default=utcnow)
    candidates: Mapped[int] = mapped_column(default=0)
    chart_review: Mapped[int] = mapped_column(default=0)


class InboxMessage(Base):
    """Something for office staff that isn't tied to a known patient: an unknown caller's message,
    or a text from a number we don't recognize."""

    __tablename__ = "inbox_message"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(default=utcnow)
    channel: Mapped[str] = mapped_column(String(10))  # call | sms
    from_phone: Mapped[str] = mapped_column(String(20), default="")
    name: Mapped[str] = mapped_column(String(200), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    resolved: Mapped[bool] = mapped_column(default=False)
