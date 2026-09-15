import logging
import shutil
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.config import get_settings
from app.core.logging_config import configure_logging, request_id_var
from app.core.middleware import RateLimitMiddleware, RequestContextMiddleware
from app.core.providers import provider_status
from app.core.storage import B2Service
from app.db import init_db

logger = logging.getLogger("advault")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await reconcile_interrupted_runs()
    yield


async def reconcile_interrupted_runs() -> None:
    """Fail runs left in flight by a restart.

    The job queue lives in this process, so anything still QUEUED or RUNNING at
    boot has no worker behind it and would otherwise spin in the UI forever.
    """
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models.orm import Run, RunStatus

    async with SessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(Run).where(
                        Run.status.in_([RunStatus.QUEUED, RunStatus.RUNNING])
                    )
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            return
        for run in rows:
            run.status = RunStatus.FAILED
            run.error = "Interrupted by a server restart. Retry to run it again."
            run.finished_at = datetime.now(UTC)
        await db.commit()
        logger.warning(
            "Reconciled interrupted runs at startup", extra={"count": len(rows)}
        )


def _register_error_handlers(app: FastAPI, *, redact: bool) -> None:
    """Unexpected errors are logged in full but never echoed back to clients."""

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]}
                    for e in exc.errors()
                ],
                "request_id": request_id_var.get(),
            },
        )

    @app.exception_handler(HTTPException)
    async def on_http_error(_: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "request_id": request_id_var.get()},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def on_unhandled(request: Request, exc: Exception):
        logger.exception(
            "Unhandled application error",
            extra={"path": request.url.path, "method": request.method},
        )
        detail = (
            "An internal error occurred. Quote the request ID when reporting it."
            if redact
            else f"{type(exc).__name__}: {exc}"
        )
        return JSONResponse(
            status_code=500,
            content={"detail": detail, "request_id": request_id_var.get()},
        )


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Provenance-driven AI advertising asset pipeline "
            "powered by Genblaze + Backblaze B2."
        ),
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
    )

    # Middleware runs bottom-up: rate limit first, then request context.
    if settings.rate_limit_enabled:
        app.add_middleware(
            RateLimitMiddleware,
            requests=settings.rate_limit_requests,
            write_requests=settings.rate_limit_write_requests,
            window_seconds=settings.rate_limit_window_seconds,
        )
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    _register_error_handlers(app, redact=settings.is_production)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/health", tags=["system"])
    def health():
        """Liveness probe — B2 reachability, ffmpeg, and provider readiness."""
        b2_connected = (
            B2Service(settings).probe_connection() if settings.b2_configured else False
        )
        ffmpeg_present = bool(shutil.which(settings.ffmpeg_path or "ffmpeg"))
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
