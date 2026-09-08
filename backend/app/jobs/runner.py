"""Background job helpers for long-running Genblaze pipelines."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_running: set[str] = set()
_tasks: dict[str, asyncio.Task] = {}
_cancelled: set[str] = set()


class RunCancelled(BaseException):
    """Raised inside the worker thread to unwind a cancelled pipeline.

    Inherits from BaseException so the pipeline's ``except Exception`` vendor
    fallback handlers treat it as a real abort rather than a provider failure
    worth retrying against another vendor.
    """


def is_running(run_id: str) -> bool:
    return run_id in _running


def active_run_ids() -> set[str]:
    return set(_running)


def enqueue_run(run_id: str) -> None:
    """Schedule pipeline execution without blocking the request."""
    if run_id in _running:
        logger.info("Run already executing", extra={"run_id": run_id})
        return

    _cancelled.discard(run_id)

    async def _runner() -> None:
        _running.add(run_id)
        try:
            from app.services.generation_service import GenerationService

            await GenerationService().execute_run(run_id)
        except asyncio.CancelledError:
            logger.info("Run task cancelled", extra={"run_id": run_id})
            raise
        finally:
            _running.discard(run_id)
            _tasks.pop(run_id, None)

    try:
        loop = asyncio.get_running_loop()
        _tasks[run_id] = loop.create_task(_runner(), name=f"run:{run_id}")
    except RuntimeError:
        # Fallback for non-async contexts (scripts, tests)
        asyncio.run(_runner())


def request_cancel(run_id: str) -> bool:
    """Flag a run for cancellation.

    Pipelines run in a worker thread that cannot be killed, so cancellation is
    cooperative: the flag is checked at every pipeline step boundary and the
    step already in flight is allowed to finish. Returns True if a task was
    still executing.
    """
    _cancelled.add(run_id)
    task = _tasks.get(run_id)
    return task is not None and not task.done()


def is_cancelled(run_id: str) -> bool:
    return run_id in _cancelled


def clear_cancelled(run_id: str) -> None:
    """Must be called before re-queueing, or a retry cancels itself."""
    _cancelled.discard(run_id)
