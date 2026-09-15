"""Tests for validation limits, run lifecycle endpoints, and format presets."""

from fastapi.testclient import TestClient

from app.core.formats import DEFAULT_FORMAT, get_format
from app.main import app


def _make_campaign(client: TestClient, name: str = "Validation Campaign") -> str:
    response = client.post(
        "/api/v1/campaigns",
        json={"name": name, "product_name": "Aurora Bottle"},
    )
    assert response.status_code == 201
    return response.json()["id"]


class TestInputLimits:
    def test_rejects_oversized_brief(self):
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/campaigns",
                json={
                    "name": "Too big",
                    "product_name": "Aurora Bottle",
                    "brief": "x" * 5001,
                },
            )
            assert response.status_code == 422

    def test_rejects_blank_name(self):
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/campaigns",
                json={"name": "", "product_name": "Aurora Bottle"},
            )
            assert response.status_code == 422

    def test_rejects_oversized_prompt_override(self):
        with TestClient(app) as client:
            campaign_id = _make_campaign(client, "Prompt limits")
            response = client.post(
                f"/api/v1/campaigns/{campaign_id}/generate",
                json={"mode": "quick", "prompt_override": "y" * 2001},
            )
            assert response.status_code == 422

    def test_validation_errors_are_structured(self):
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/campaigns",
                json={"product_name": "Missing name"},
            )
            assert response.status_code == 422
            body = response.json()
            assert isinstance(body["detail"], list)
            assert "field" in body["detail"][0]
            assert "request_id" in body


class TestRunEndpoints:
    def test_list_runs_is_paginated(self):
        with TestClient(app) as client:
            campaign_id = _make_campaign(client, "Listing runs")
            client.post(
                f"/api/v1/campaigns/{campaign_id}/generate", json={"mode": "quick"}
            )

            response = client.get("/api/v1/runs", params={"page": 1, "page_size": 5})
            assert response.status_code == 200
            body = response.json()
            assert {"items", "total", "page", "page_size"} <= body.keys()
            assert body["page_size"] == 5
            if body["items"]:
                assert "campaign_name" in body["items"][0]
                assert "asset_count" in body["items"][0]

    def test_list_runs_filters_by_campaign(self):
        with TestClient(app) as client:
            campaign_id = _make_campaign(client, "Filtered runs")
            client.post(
                f"/api/v1/campaigns/{campaign_id}/generate", json={"mode": "quick"}
            )
            response = client.get(
                "/api/v1/runs", params={"campaign_id": campaign_id}
            )
            assert response.status_code == 200
            for item in response.json()["items"]:
                assert item["campaign_id"] == campaign_id

    def test_cancel_unknown_run_is_404(self):
        with TestClient(app) as client:
            assert client.post("/api/v1/runs/does-not-exist/cancel").status_code == 404

    def test_retry_rejects_non_failed_run(self):
        with TestClient(app) as client:
            campaign_id = _make_campaign(client, "Retry guard")
            run = client.post(
                f"/api/v1/campaigns/{campaign_id}/generate", json={"mode": "quick"}
            ).json()
            response = client.post(f"/api/v1/runs/{run['id']}/retry")
            assert response.status_code in {409, 202}


class TestFormats:
    def test_format_endpoint_lists_presets(self):
        with TestClient(app) as client:
            response = client.get("/api/v1/formats")
            assert response.status_code == 200
            formats = response.json()["formats"]
            keys = {f["key"] for f in formats}
            assert {"landscape", "square", "portrait", "vertical"} <= keys

    def test_vertical_preset_is_nine_by_sixteen(self):
        fmt = get_format("vertical")
        assert (fmt.width, fmt.height) == (1080, 1920)
        assert fmt.aspect == "9:16"

    def test_unknown_format_falls_back_to_default(self):
        assert get_format("not-a-format").key == DEFAULT_FORMAT
        assert get_format(None).key == DEFAULT_FORMAT

    def test_generate_accepts_a_format(self):
        with TestClient(app) as client:
            campaign_id = _make_campaign(client, "Format run")
            response = client.post(
                f"/api/v1/campaigns/{campaign_id}/generate",
                json={"mode": "quick", "video_format": "vertical"},
            )
            assert response.status_code == 202
            assert response.json()["prompt_snapshot"]["format"] == "vertical"


class TestObservability:
    def test_responses_carry_a_request_id(self):
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.headers.get("X-Request-ID")

    def test_supplied_request_id_is_echoed(self):
        with TestClient(app) as client:
            response = client.get("/health", headers={"X-Request-ID": "trace-me-123"})
            assert response.headers["X-Request-ID"] == "trace-me-123"
