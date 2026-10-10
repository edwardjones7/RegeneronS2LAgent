import os

os.environ["MOCK_MODE"] = "true"
os.environ["TOOL_SECRET"] = "test-secret"
os.environ["READ_API_KEY"] = "test-read"
os.environ["ELEVENLABS_WEBHOOK_SECRET"] = "whsec-test"

import pytest  # noqa: E402

from app import db  # noqa: E402
from app.campaigns import get_campaign  # noqa: E402


@pytest.fixture
def campaign():
    return get_campaign("olatorepatide-nct07685808")


@pytest.fixture
def session():
    db.init_engine("sqlite://")
    with db.session_scope() as s:
        yield s
