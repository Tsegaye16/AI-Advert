import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.config import get_settings
from app.core.providers import provider_status
from app.core.storage import B2Service
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Provenance-driven AI advertising asset pipeline "
            "powered by Genblaze + Backblaze B2."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/health")
    def health():
        """Liveness probe — B2 reachability, ffmpeg, and provider readiness."""
        b2_connected = B2Service(settings).probe_connection() if settings.b2_configured else False
        ffmpeg_present = bool(
            shutil.which(settings.ffmpeg_path or "ffmpeg")
        )
        providers = provider_status(settings)
        degraded = settings.b2_configured and not b2_connected
        return {
            "status": "degraded" if degraded else "ok",
            "app": settings.app_name,
            "b2_configured": settings.b2_configured,
            "b2_connected": b2_connected,
            "ffmpeg_present": ffmpeg_present,
            "demo_mode": settings.demo_mode,
            "providers": providers,
        }

    return app


app = create_app()
