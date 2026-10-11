from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.main import app


@pytest.fixture
def client():
    db.init_engine("sqlite://")
    with patch("app.main.db.init_engine"), TestClient(app) as c:
        yield c


def test_dashboard_requires_login(client):
    r = client.get("/dashboard", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/dashboard/login?next=/dashboard"


def test_lead_deep_link_redirects_to_query(client):
    r = client.get("/dashboard/leads/3", follow_redirects=False)
    assert r.headers["location"] == "/dashboard?lead=3"


def test_wrong_password(client):
    r = client.post("/dashboard/login", data={"password": "nope", "next": "/dashboard"}, follow_redirects=False)
    assert "error=1" in r.headers["location"]


def test_login_then_dashboard_and_read_api(client):
    r = client.post("/dashboard/login", data={"password": "test-dash", "next": "/dashboard?lead=3"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/dashboard?lead=3"
    assert client.get("/dashboard").status_code in (200, 503)  # 503 only if the web app isn't built
    assert client.get("/campaigns").status_code == 200  # cookie works for the read API


def test_login_never_redirects_off_site(client):
    r = client.post("/dashboard/login", data={"password": "test-dash", "next": "https://evil.example"}, follow_redirects=False)
    assert r.headers["location"] == "/dashboard"


def test_session_expiry_and_tamper():
    tok = auth.make_session(now=1000)
    assert auth.valid_session(tok, now=1001)
    assert not auth.valid_session(tok, now=1000 + auth.SESSION_SECS + 1)
    assert not auth.valid_session(tok[:-1] + ("0" if tok[-1] != "0" else "1"), now=1001)


def test_assets_cannot_escape_the_build_dir(client):
    assert client.get("/dashboard/..%2F..%2F.env").status_code == 404
    assert client.get("/dashboard/%2E%2E/%2E%2E/.env").status_code == 404
