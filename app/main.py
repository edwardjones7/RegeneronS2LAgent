"""FastAPI app: lead intake, agent tools, webhooks, read API, and the retry worker."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app import db, service
from app.campaigns import all_campaigns
from app.config import ROOT, get_settings
from app.routes import leads, read_api, tools, webhooks
from app.slots import seed_slots

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


def worker_tick() -> int:
    """Dial queued leads whose calling window opened and no-answer leads due for a retry."""
    webhooks.poll_open_calls()
    with db.session_scope() as s:
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
    log.info("mock_mode=%s public_base_url=%s", s.mock_mode, s.public_base_url)
    task = asyncio.create_task(_worker_loop(interval))
    yield
    task.cancel()


app = FastAPI(title="Call Me Maybe: speed-to-lead voice agent", lifespan=lifespan)
app.include_router(leads.router)
app.include_router(tools.router)
app.include_router(webhooks.router)
app.include_router(read_api.router)


@app.get("/health")
def health():
    return {"ok": True, "mock_mode": get_settings().mock_mode}


@app.get("/demo", include_in_schema=False)
def demo_form():
    return FileResponse(Path(ROOT) / "demo" / "form.html")
