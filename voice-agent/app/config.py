"""Settings loaded from the environment / .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent  # the monorepo: data/, protocols/, site/


class Settings(BaseSettings):
    # Later files win: the repo-root .env, then site/.env (Supabase keys), then voice-agent/.env.
    model_config = SettingsConfigDict(env_file=(REPO / ".env", REPO / "site" / ".env", ROOT / ".env"), extra="ignore")

    # With MOCK_MODE on, no call or text leaves the machine: voice and SMS are simulated.
    mock_mode: bool = True

    database_url: str = f"sqlite:///{ROOT / 'call_me_maybe.db'}"
    campaigns_dir: Path = ROOT / "campaigns"

    # Public URL that ElevenLabs uses to reach our tool + webhook endpoints (tunnel URL).
    public_base_url: str = "http://localhost:8000"

    # Shared secret ElevenLabs sends on every tool call; API key for the read API.
    tool_secret: str = "dev-tool-secret"
    read_api_key: str = "dev-read-key"
    # Dashboard login password; falls back to READ_API_KEY when unset.
    dashboard_password: str = ""

    elevenlabs_api_key: str = Field(
        default="", validation_alias=AliasChoices("ELEVENLABS_API_KEY", "ELEVEN_LAB_API_KEY")
    )
    elevenlabs_agent_id: str = ""
    elevenlabs_phone_number_id: str = ""
    elevenlabs_webhook_secret: str = ""
    elevenlabs_llm: str = ""
    elevenlabs_voice_id: str = ""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"

    twilio_account_sid: str = ""
    twilio_auth_token: str = Field(
        default="", validation_alias=AliasChoices("TWILIO_AUTH_TOKEN", "TWILIO_API_KEY")
    )
    twilio_from_number: str = ""

    # Set by Vercel at runtime. Serverless: no background loop, dial inline, cron drives retries.
    vercel: bool = False
    # Vercel Cron sends "Authorization: Bearer $CRON_SECRET" to /cron/tick.
    cron_secret: str = ""

    # Max dial attempts per lead (first call + retries).
    max_attempts: int = 3
    worker_interval_secs: int = 30

    # ---- Practice outreach
    # The EHR stand-in. Without these, patients come from data/synthea-nj.json (tests, offline demo).
    # On Vercel the bundle holds only voice-agent/, so the build copies ../data and ../protocols in (see vercel.json).
    supabase_url: str = ""
    supabase_secret_key: str = ""
    patients_file: Path = ROOT / "data" / "synthea-nj.json" if (ROOT / "data").is_dir() else REPO / "data" / "synthea-nj.json"
    protocols_dir: Path = ROOT / "protocols" if (ROOT / "protocols").is_dir() else REPO / "protocols"
    # How many calls may be in progress at once across all practices.
    batch_size: int = 10
    # Real, verified phone numbers (comma-separated) given to the first candidates of each accepted
    # trial, so the demo rings real phones. Everyone else is simulated. Only people who agreed.
    demo_phones: str = ""
    # Demo fast-forward: when > 0, a "day" between attempts lasts this many seconds and calling
    # hours are ignored. 0 = real timing.
    demo_day_seconds: int = 0
    # Seconds a simulated call takes before its outcome lands.
    simulated_call_secs: int = 12

    @property
    def demo_phone_list(self) -> list[str]:
        return [p.strip() for p in self.demo_phones.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
