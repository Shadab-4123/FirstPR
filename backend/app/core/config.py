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

    # GitHub login (OAuth App). Callback URL to register on GitHub:
    #   {app_url}/api/v1/auth/github/callback
    github_client_id: str | None = None
    github_client_secret: str | None = None
    # Fernet key that encrypts stored GitHub tokens. Generate one with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    token_encryption_key: str | None = None
    # The site's public origin (the frontend, which proxies /api to us).
    app_url: str = "http://localhost:5173"

    # Difficulty model file; empty = ml/difficulty_model.joblib in the repo checkout.
    difficulty_model_path: str = ""

    # Sync worker tuning
    github_max_retries: int = 5
    github_max_rate_limit_wait_s: float = 900.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
