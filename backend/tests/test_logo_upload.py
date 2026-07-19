from io import BytesIO
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app


def test_upload_campaign_logo():
    png = BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
    with TestClient(app) as client:
        create = client.post(
            "/api/v1/campaigns",
            json={"name": "Logo Test", "product_name": "Widget"},
        )
        assert create.status_code == 201
        campaign_id = create.json()["id"]

        with patch("app.api.v1.campaigns.get_settings") as mock_settings:
            settings = MagicMock()
            settings.b2_configured = True
            settings.b2_prefix = "advault"
            mock_settings.return_value = settings

            b2 = MagicMock()
            with patch("app.api.v1.campaigns.B2Service", return_value=b2):
                resp = client.post(
                    f"/api/v1/campaigns/{campaign_id}/logo",
                    files={"file": ("logo.png", png, "image/png")},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["logo_b2_key"] == f"advault/campaigns/{campaign_id}/brand/logo.png"
        b2.put_bytes.assert_called_once()


def test_upload_logo_rejects_non_image():
    with TestClient(app) as client:
        create = client.post(
            "/api/v1/campaigns",
            json={"name": "Bad Logo", "product_name": "Widget"},
        )
        campaign_id = create.json()["id"]

        with patch("app.api.v1.campaigns.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(b2_configured=True, b2_prefix="advault")
            with patch("app.api.v1.campaigns.B2Service"):
                resp = client.post(
                    f"/api/v1/campaigns/{campaign_id}/logo",
                    files={"file": ("x.txt", BytesIO(b"hello"), "text/plain")},
                )
        assert resp.status_code == 400
