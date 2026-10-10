"""Coordinator dashboard pages. Data comes from the read API (same origin, session cookie)."""

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Form, Request
from fastapi.responses import FileResponse, RedirectResponse

from app import auth
from app.config import ROOT

DASHBOARD_DIR = Path(ROOT) / "dashboard"

router = APIRouter(prefix="/dashboard", include_in_schema=False)


def _page(request: Request, session: str | None):
    if not auth.valid_session(session):
        return RedirectResponse(f"/dashboard/login?next={quote(request.url.path)}", status_code=303)
    return FileResponse(DASHBOARD_DIR / "index.html", headers={"Cache-Control": "no-store"})


@router.get("")
@router.get("/")
def dashboard(request: Request, cmm_session: str | None = Cookie(default=None)):
    return _page(request, cmm_session)


@router.get("/leads/{lead_id}")
def lead_page(lead_id: int, request: Request, cmm_session: str | None = Cookie(default=None)):
    return _page(request, cmm_session)


@router.get("/login")
def login_page():
    return FileResponse(DASHBOARD_DIR / "login.html")


@router.post("/login")
def login(request: Request, password: str = Form(...), next: str = Form("/dashboard")):
    if not auth.check_password(password):
        return RedirectResponse(f"/dashboard/login?error=1&next={quote(next)}", status_code=303)
    target = next if next.startswith("/dashboard") else "/dashboard"
    resp = RedirectResponse(target, status_code=303)
    resp.set_cookie(
        auth.COOKIE,
        auth.make_session(),
        max_age=auth.SESSION_SECS,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
    )
    return resp


@router.post("/logout")
def logout():
    resp = RedirectResponse("/dashboard/login", status_code=303)
    resp.delete_cookie(auth.COOKIE)
    return resp


@router.get("/static/{name}")
def static(name: str):
    path = (DASHBOARD_DIR / name).resolve()
    if path.parent != DASHBOARD_DIR.resolve() or path.suffix not in {".css", ".js", ".svg"} or not path.exists():
        return RedirectResponse("/dashboard")
    return FileResponse(path)
