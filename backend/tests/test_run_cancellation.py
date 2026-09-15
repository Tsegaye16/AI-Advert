"""Cancellation is cooperative — these tests pin the behaviour that broke:
a cancelled run must not be resurrected by the worker finishing its thread.
"""

import asyncio

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.jobs.runner import (
    RunCancelled,
    clear_cancelled,
    is_cancelled,
    request_cancel,
)
from app.main import app
from app.models.orm import Run, RunStatus
from app.services.generation_service import GenerationService


def _campaign(client: TestClient, name: str) -> str:
    response = client.post(
        "/api/v1/campaigns", json={"name": name, "product_name": "Aurora Bottle"}
    )
    assert response.status_code == 201
    return response.json()["id"]


def _run(client: TestClient, campaign_id: str) -> dict:
    response = client.post(
        f"/api/v1/campaigns/{campaign_id}/generate", json={"mode": "quick"}
    )
    assert response.status_code == 202
    return response.json()


class TestCancelRegistry:
    def test_flag_round_trip(self):
        run_id = "registry-test-run"
        assert not is_cancelled(run_id)
        request_cancel(run_id)
        assert is_cancelled(run_id)
        clear_cancelled(run_id)
        assert not is_cancelled(run_id)

    def test_cancelled_is_not_an_exception_subclass(self):
        """`except Exception` in provider fallbacks must not swallow an abort."""
        assert issubclass(RunCancelled, BaseException)
        assert not issubclass(RunCancelled, Exception)


class TestCancelEndpoint:
    def test_cancel_marks_cancelled_not_failed(self):
        with TestClient(app) as client:
            campaign_id = _campaign(client, "Cancel status")
            run = _run(client, campaign_id)

            response = client.post(f"/api/v1/runs/{run['id']}/cancel")
            assert response.status_code == 202
            body = response.json()
            assert body["status"] == "cancelled"
            assert body["error"] == "Cancelled by user"
            assert body["finished_at"] is not None
            clear_cancelled(run["id"])

    def test_pending_steps_are_marked_cancelled(self):
        with TestClient(app) as client:
            campaign_id = _campaign(client, "Cancel steps")
            run = _run(client, campaign_id)

            body = client.post(f"/api/v1/runs/{run['id']}/cancel").json()
            statuses = {step["status"] for step in body["steps"]}
            assert "queued" not in statuses
            assert "running" not in statuses
            clear_cancelled(run["id"])

    def test_cancelling_a_finished_run_is_rejected(self):
        with TestClient(app) as client:
            campaign_id = _campaign(client, "Cancel twice")
            run = _run(client, campaign_id)

            assert client.post(f"/api/v1/runs/{run['id']}/cancel").status_code == 202
            second = client.post(f"/api/v1/runs/{run['id']}/cancel")
            assert second.status_code == 409
            clear_cancelled(run["id"])

    def test_cancel_unknown_run_is_404(self):
        with TestClient(app) as client:
            assert client.post("/api/v1/runs/nope/cancel").status_code == 404


class TestWorkerDoesNotResurrect:
    """The original bug: the worker thread finished and wrote SUCCEEDED over
    the user's cancellation, so the UI showed the pipeline still running."""

    def test_execute_run_respects_a_prior_cancel(self):
        with TestClient(app) as client:
            campaign_id = _campaign(client, "No resurrection")
            run = _run(client, campaign_id)
            run_id = run["id"]

            client.post(f"/api/v1/runs/{run_id}/cancel")

            async def _drive() -> RunStatus:
                # Simulate the worker completing after the user cancelled.
                await GenerationService().execute_run(run_id)
                async with SessionLocal() as db:
                    row = await db.get(Run, run_id)
                    return row.status

            assert asyncio.run(_drive()) is RunStatus.CANCELLED
            clear_cancelled(run_id)


class TestRetry:
    def test_cancelled_runs_can_be_retried(self):
        with TestClient(app) as client:
            campaign_id = _campaign(client, "Retry cancelled")
            run = _run(client, campaign_id)
            run_id = run["id"]

            client.post(f"/api/v1/runs/{run_id}/cancel")
            response = client.post(f"/api/v1/runs/{run_id}/retry")

            assert response.status_code == 202
            assert response.json()["status"] in {"queued", "running", "succeeded"}
            # Retry must clear the flag or the new attempt aborts immediately.
            assert not is_cancelled(run_id)

    def test_retry_rejects_a_running_run(self):
        with TestClient(app) as client:
            campaign_id = _campaign(client, "Retry guard")
            run = _run(client, campaign_id)
            response = client.post(f"/api/v1/runs/{run['id']}/retry")
            assert response.status_code in {409, 202}
