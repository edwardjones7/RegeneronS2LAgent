"""Coordinator dashboard: the static Next.js export in web/out, served behind the session login.

Build it with `cd web && npm run build`. Data comes from the read API (same origin, cookie auth).
"""

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Form, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse

from app import auth
from app.config import ROOT

OUT_DIR = (Path(ROOT) / "web" / "out").resolve()
NO_STORE = {"Cache-Control": "no-store"}
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

router = APIRouter(prefix="/dashboard", include_in_schema=False)


def _file(name: str) -> Path:
    path = OUT_DIR / name
    if not path.exists():
        raise HTTPException(503, "Dashboard not built yet: run `cd web && npm ci && npm run build`")
    return path


@router.get("")
@router.get("/")
def dashboard(request: Request, cmm_session: str | None = Cookie(default=None)):
    if not auth.valid_session(cmm_session):
        target = request.url.path + (f"?{request.url.query}" if request.url.query else "")
        return RedirectResponse(f"/dashboard/login?next={quote(target)}", status_code=303)
    return FileResponse(_file("index.html"), headers=NO_STORE)


@router.get("/leads/{lead_id}")
def lead_page(lead_id: int):
    """Deep link used in coordinator texts; the dashboard opens the lead from ?lead=."""
    return RedirectResponse(f"/dashboard?lead={lead_id}", status_code=303)


@router.get("/login")
def login_page():
    return FileResponse(_file("login.html"), headers=NO_STORE)


@router.post("/login")
def login(request: Request, password: str = Form(...), next: str = Form("/dashboard")):
    if not auth.check_password(password):
        return RedirectResponse(f"/dashboard/login?error=1&next={quote(next)}", status_code=303)
    target = next if next.startswith("/dashboard") and not next.startswith("/dashboard/login") else "/dashboard"
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


@router.get("/{asset:path}")
def asset(asset: str, request: Request, cmm_session: str | None = Cookie(default=None)):
    """Build output: other dashboard pages (behind login), hashed JS/CSS/fonts under _next/
    (cached forever), favicon etc."""
    page = (OUT_DIR / f"{asset.rstrip('/')}.html").resolve()
    if page.is_relative_to(OUT_DIR) and page.is_file() and asset not in ("login", "opt-in"):
        if not auth.valid_session(cmm_session):
            return RedirectResponse(f"/dashboard/login?next={quote(request.url.path)}", status_code=303)
        return FileResponse(page, headers=NO_STORE)
    path = (OUT_DIR / asset).resolve()
    if not path.is_relative_to(OUT_DIR) or not path.is_file() or path.suffix == ".html":
        raise HTTPException(404)
    return FileResponse(path, headers=IMMUTABLE if asset.startswith("_next/static/") else {"Cache-Control": "public, max-age=3600"})
