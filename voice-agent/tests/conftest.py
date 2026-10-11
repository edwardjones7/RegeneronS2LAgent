import os

os.environ["MOCK_MODE"] = "true"
os.environ["TOOL_SECRET"] = "test-secret"
os.environ["READ_API_KEY"] = "test-read"
os.environ["DASHBOARD_PASSWORD"] = "test-dash"
os.environ["ELEVENLABS_WEBHOOK_SECRET"] = "whsec-test"
# Tests never touch Supabase or real phones: patients come from data/synthea-nj.json.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["DEMO_PHONES"] = ""
os.environ["DEMO_DAY_SECONDS"] = "0"
os.environ["CALL_SUNDAYS"] = "false"
os.environ["TWILIO_FROM_NUMBER"] = "+12015550123"

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
