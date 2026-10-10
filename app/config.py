"""Settings loaded from the environment / .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

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

    # Max dial attempts per lead (first call + retries).
    max_attempts: int = 3
    worker_interval_secs: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
