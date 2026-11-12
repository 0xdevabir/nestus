"""NESTUS intelligence plane — FastAPI application."""

from fastapi import FastAPI

from nestus_ai import __version__
from nestus_ai.settings import settings

app = FastAPI(
    title="NESTUS AI",
    version=__version__,
    docs_url="/docs",
)


@app.get("/health")
async def health() -> dict:
    """Liveness probe used by the control plane."""
    return {"status": "ok", "version": __version__}


@app.on_event("startup")
async def on_startup() -> None:
    settings.log_level()  # touch settings so invalid config fails fast at boot
