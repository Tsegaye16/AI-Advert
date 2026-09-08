"""Cross-cutting HTTP middleware: request IDs, access logs, rate limiting."""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging_config import request_id_var

logger = logging.getLogger("advault.http")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request ID and emits one structured access log line per request."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled error",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            raise
        finally:
            request_id_var.reset(token)

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "client": request.client.host if request.client else None,
            },
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Fixed-cost sliding-window limiter, keyed by client IP.

    In-process only, which is correct for the single-container deployment this
    ships with. Move to Redis before running more than one replica.
    """

    def __init__(
        self,
        app,
        *,
        requests: int = 120,
        window_seconds: int = 60,
        write_requests: int = 20,
        exempt_paths: tuple[str, ...] = ("/health", "/docs", "/openapi.json", "/redoc"),
    ) -> None:
        super().__init__(app)
        self.requests = requests
        self.window = window_seconds
        self.write_requests = write_requests
        self.exempt_paths = exempt_paths
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._writes: dict[str, deque[float]] = defaultdict(deque)

    @staticmethod
    def _client_key(request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _over_limit(
        self, bucket: dict[str, deque[float]], key: str, limit: int, now: float
    ) -> bool:
        hits = bucket[key]
        cutoff = now - self.window
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= limit:
            return True
        hits.append(now)
        return False

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path.startswith(self.exempt_paths):
            return await call_next(request)

        key = self._client_key(request)
        now = time.monotonic()

        if self._over_limit(self._hits, key, self.requests, now):
            return self._too_many(self.window)

        is_write = request.method in {"POST", "PUT", "PATCH", "DELETE"}
        if is_write and self._over_limit(self._writes, key, self.write_requests, now):
            return self._too_many(self.window)

        return await call_next(request)

    @staticmethod
    def _too_many(retry_after: int) -> JSONResponse:
        logger.warning("rate_limited")
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Slow down and try again shortly."},
            headers={"Retry-After": str(retry_after)},
        )
