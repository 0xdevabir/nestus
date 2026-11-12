"""NESTUS AI application settings, loaded from the repo root .env."""

import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the repository (ai/../..)
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(_REPO_ROOT, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    node_env: str = "development"
    api_url: str = "http://localhost:4000"
    internal_service_token: str = "change-me"
    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    ollama_base_url: str = ""

    def log_level(self) -> str:
        """Debug logging in development, info otherwise."""
        return "DEBUG" if self.node_env == "development" else "INFO"


settings = Settings()

logging.basicConfig(level=settings.log_level())
