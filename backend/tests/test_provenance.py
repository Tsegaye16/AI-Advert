import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.provenance_service import ProvenanceService


def test_verify_asset_manifest_and_bytes():
    settings = MagicMock()
    settings.b2_configured = True
    b2 = MagicMock()
    b2.get_bytes.return_value = json.dumps(
        {"canonical_hash": "abc123", "run": {"run_id": "r1", "steps": []}}
    ).encode()
    b2.verify_object_hash.return_value = (True, "deadbeef" * 8)

    asset = SimpleNamespace(
        id="asset-1",
        b2_key="advault/final.mp4",
        sha256="deadbeef" * 8,
        provider="ffmpeg",
        model="mux",
    )
    run = SimpleNamespace(
        id="run-1",
        manifest_b2_key="advault/manifest.json",
        canonical_hash="abc123",
        parent_run_id=None,
        steps=[],
        assets=[asset],
    )

    fake_manifest = MagicMock()
    fake_manifest.verify.return_value = True

    service = ProvenanceService()
    service.settings = settings
    service.b2 = b2

    async def _run():
        with patch("genblaze_core.Manifest") as mock_manifest_cls:
            mock_manifest_cls.model_validate.return_value = fake_manifest
            return await service.verify_asset(AsyncMock(), asset, run)

    result = asyncio.run(_run())
    assert result.manifest_ok is True
    assert result.byte_match is True
    assert result.verified is True


def test_build_provenance_loads_manifest_json():
    settings = MagicMock()
    settings.b2_configured = True
    b2 = MagicMock()
    b2.get_bytes.return_value = b'{"canonical_hash": "xyz"}'

    asset = SimpleNamespace(id="a1", provider="nvidia", model="flux")
    run = SimpleNamespace(
        id="r1",
        manifest_b2_key="advault/m.json",
        canonical_hash="xyz",
        parent_run_id=None,
        steps=[{"name": "image"}],
        assets=[asset],
    )

    service = ProvenanceService()
    service.settings = settings
    service.b2 = b2

    async def _run():
        return await service.build_provenance(AsyncMock(), asset, run)

    out = asyncio.run(_run())
    assert out.canonical_hash == "xyz"
    assert out.manifest == {"canonical_hash": "xyz"}
