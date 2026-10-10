"""FastAPI app: lead intake, agent tools, webhooks, read API, and the retry worker."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app import db, messaging, service
from app.campaigns import all_campaigns
from app.config import ROOT, get_settings
from app.routes import coordinator, dashboard, leads, read_api, tools, webhooks
from app.models import Lead
from app.slots import seed_slots

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


def worker_tick() -> int:
    """Dial queued leads whose calling window opened and no-answer leads due for a retry."""
    webhooks.poll_open_calls()
    with db.session_scope() as s:
        service.settle_stale_calls(s)
        messaging.send_due_reminders(s)
        due = service.due_leads(s)
    for lead_id in due:
        service.dial(lead_id)
    return len(due)


async def _worker_loop(interval: int):
    while True:
        try:
            n = await run_in_threadpool(worker_tick)
            if n:
                log.info("worker dialed %s lead(s)", n)
        except Exception:  # noqa: BLE001
            log.exception("worker tick failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_engine()
    with db.session_scope() as s:
        for c in all_campaigns().values():
            seed_slots(s, c)
    s = get_settings()
    interval = s.worker_interval_secs
    if not s.elevenlabs_webhook_secret and not s.mock_mode:
        interval = min(interval, 15)  # no webhook: we poll ElevenLabs for call results, so check often
    log.info("mock_mode=%s vercel=%s public_base_url=%s", s.mock_mode, s.vercel, s.public_base_url)
    # On Vercel there is no long-running process: Vercel Cron calls /cron/tick instead.
    task = None if s.vercel else asyncio.create_task(_worker_loop(interval))
    yield
    if task:
        task.cancel()


app = FastAPI(title="Call Me Maybe: speed-to-lead voice agent", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.include_router(leads.router)
app.include_router(tools.router)
app.include_router(webhooks.router)
app.include_router(read_api.router)
app.include_router(coordinator.router)
app.include_router(dashboard.router)
app.include_router(dashboard.auth_router)


@app.get("/cron/tick", include_in_schema=False)
def cron_tick(request: Request):
    """Retries, queued leads, reminders and stale calls. Called by Vercel Cron (or any scheduler)."""
    secret = get_settings().cron_secret
    if not secret or request.headers.get("authorization") != f"Bearer {secret}":
        raise HTTPException(401, "unauthorized")
    return {"dialed": worker_tick()}


@app.get("/health")
def health():
    return {"ok": True, "mock_mode": get_settings().mock_mode}


@app.get("/visits/{token}.ics", include_in_schema=False)
def visit_ics(token: str):
    """Calendar file for a booked visit; the unguessable token comes from the patient's text."""
    from fastapi import HTTPException
    from fastapi.responses import Response

    lead_id = messaging.lead_id_from_token(token)
    with db.session_scope() as s:
        lead = s.get(Lead, lead_id) if lead_id else None
        slot = service.booked_slot(s, lead) if lead else None
        if slot is None:
            raise HTTPException(404, "No upcoming visit")
        body = messaging.ics(lead, slot)
    return Response(body, media_type="text/calendar", headers={"Content-Disposition": 'attachment; filename="screening-visit.ics"'})


@app.get("/demo", include_in_schema=False)
def demo_form():
    """Public ad opt-in page. Uses the built web app when present, else the plain HTML fallback."""
    built = Path(ROOT) / "web" / "out" / "opt-in.html"
    page = built if built.exists() else Path(ROOT) / "demo" / "form.html"
    return FileResponse(page, headers={"Cache-Control": "no-store"})
