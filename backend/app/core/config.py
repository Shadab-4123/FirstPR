from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a .env file).

    Nothing secret has a default, so a missing token fails loudly instead of
    silently running unauthenticated in production.
    """

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql+psycopg://firstpr@localhost:5433/firstpr"
    github_token: str | None = None
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"

    # Difficulty model file; empty = ml/difficulty_model.joblib in the repo checkout.
    difficulty_model_path: str = ""

    # Sync worker tuning
    github_max_retries: int = 5
    github_max_rate_limit_wait_s: float = 900.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
