"""Application configuration.

All settings are read from environment variables (or a local ".env" file).
Using pydantic-settings means values are validated and have sensible defaults,
so the app still starts even if some variables are missing.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Where the PostgreSQL database lives. The "+asyncpg" part selects the async driver.
    DATABASE_URL: str = "postgresql+asyncpg://tj_user:CHANGE_ME@localhost:5432/trading_journal"

    # Secret key used to sign login tokens (JWT). MUST be changed in production.
    SECRET_KEY: str = "change-me-to-a-long-random-secret"

    # JWT algorithm. HS256 = simple symmetric signing with SECRET_KEY.
    ALGORITHM: str = "HS256"

    # How long a login token stays valid (minutes). Default = 7 days.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    # Allowed website origins for CORS, comma separated in the env var.
    CORS_ORIGINS: str = "http://localhost:3001,https://trading-journal.cryptosmart.site"

    # Folder on disk where uploaded images are saved.
    UPLOAD_DIR: str = "./uploads"

    # --- AI trade analysis (Claude via any compatible gateway, or a Dify app) ---
    # The feature stays disabled until an API key is provided. Works with the
    # official Anthropic API, any OpenAI/Anthropic-compatible gateway (zyloo.io,
    # OpenRouter, ...), or a self-hosted Dify Workflow app:
    #   AI_API_STYLE  – "openai"    POST <base>/chat/completions
    #                   "anthropic" POST <base>/v1/messages
    #                   "dify"      POST <base>/workflows/run (+ /files/upload for
    #                               chart images) — the app's 4 branches (trade /
    #                               overall / institutional / chat) already carry
    #                               their own model + system prompt, so AI_MODEL
    #                               is unused in this mode.
    #   AI_BASE_URL   – "openai": gateway base, e.g. "https://api.zyloo.io/v1"
    #                   "dify": the Dify **API** base, e.g. "http://<host>/v1"
    #                   (this is the URL shown in the app's "API Access" panel —
    #                   NOT the /app console page you browse to)
    #   AI_API_KEY    – the gateway/Anthropic/Dify app key (falls back to
    #                   ANTHROPIC_API_KEY for backwards compatibility)
    #   AI_MODEL      – must be a vision-capable model so charts can be analysed
    #                   (ignored when AI_API_STYLE=dify)
    AI_API_STYLE: str = "openai"
    AI_BASE_URL: str = ""
    AI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""  # legacy alias, still honoured as a key fallback
    AI_MODEL: str = "zyloo/claude-opus-4-7"
    AI_MAX_TOKENS: int = 2500
    # The institutional due-diligence report is much longer (19 sections).
    AI_REPORT_MAX_TOKENS: int = 8000

    # --- Toobit futures auto-import ---
    # Base REST host, poll cadence, and a master on/off switch. The per-user API
    # key + secret are stored (encrypted) on the user, not here.
    TOOBIT_BASE_URL: str = "https://api.toobit.com"
    TOOBIT_SYNC_ENABLED: bool = True
    TOOBIT_SYNC_INTERVAL: int = 60          # seconds between polls
    TOOBIT_RECV_WINDOW: int = 5000
    # How far back to look for fills the first time a user connects (days).
    TOOBIT_LOOKBACK_DAYS: int = 30
    # Candle interval used for the entry/exit chart images.
    TOOBIT_CHART_INTERVAL: str = "15m"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        """Split the comma separated CORS_ORIGINS string into a clean list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


# A single shared settings instance used across the app.
settings = Settings()
