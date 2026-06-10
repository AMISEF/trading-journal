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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        """Split the comma separated CORS_ORIGINS string into a clean list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


# A single shared settings instance used across the app.
settings = Settings()
