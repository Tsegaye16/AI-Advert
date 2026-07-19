from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] in {"ok", "degraded"}
        assert body["app"] == "AdVault"
        assert "b2_connected" in body
        assert "ffmpeg_present" in body
        assert "providers" in body


def test_create_campaign_and_demo_generate():
    with TestClient(app) as client:
        create = client.post(
            "/api/v1/campaigns",
            json={
                "name": "Demo Launch",
                "product_name": "Aurora Bottle",
                "product_description": "Insulated steel bottle",
                "audience": "Outdoor enthusiasts",
                "tone": "premium",
                "cta": "Buy now",
            },
        )
        assert create.status_code == 201
        campaign = create.json()
        assert campaign["id"]

        gen = client.post(
            f"/api/v1/campaigns/{campaign['id']}/generate",
            json={"mode": "quick"},
        )
        assert gen.status_code == 202
        run = gen.json()
        assert run["status"] in {"queued", "running", "succeeded"}
        assert run["id"]
