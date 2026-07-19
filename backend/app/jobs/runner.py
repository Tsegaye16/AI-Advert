"""Background job helpers for long-running Genblaze pipelines."""

from __future__ import annotations

import asyncio
import logging
from typing import Set

logger = logging.getLogger(__name__)

_running: Set[str] = set()


def enqueue_run(run_id: str) -> None:
    """Schedule pipeline execution without blocking the request."""
    if run_id in _running:
        logger.info("Run %s already executing", run_id)
        return

    async def _runner() -> None:
        _running.add(run_id)
        try:
            from app.services.generation_service import GenerationService

            await GenerationService().execute_run(run_id)
        finally:
            _running.discard(run_id)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_runner())
    except RuntimeError:
        # Fallback for non-async contexts
        asyncio.run(_runner())
