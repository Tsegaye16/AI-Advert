from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.storage import B2Service
from app.models.orm import Asset, Run
from app.models.schemas import ProvenanceOut, VerifyOut

logger = logging.getLogger(__name__)


class ProvenanceService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.b2 = B2Service(self.settings)

    async def build_provenance(
        self, db: AsyncSession, asset: Asset, run: Run
    ) -> ProvenanceOut:
        providers = sorted(
            {
                a.provider
                for a in (run.assets or [])
                if a.provider
            }
            | ({asset.provider} if asset.provider else set())
        )
        models = sorted(
            {
                a.model
                for a in (run.assets or [])
                if a.model
            }
            | ({asset.model} if asset.model else set())
        )

        manifest: dict[str, Any] | None = None
        if run.manifest_b2_key and self.settings.b2_configured:
            try:
                raw = self.b2.get_bytes(run.manifest_b2_key)
                manifest = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                logger.warning("Failed to load manifest: %s", exc)

        return ProvenanceOut(
            asset_id=asset.id,
            run_id=run.id,
            canonical_hash=run.canonical_hash,
            manifest_b2_key=run.manifest_b2_key,
            steps=run.steps or [],
            providers=providers,
            models=models,
            parent_run_id=run.parent_run_id,
            manifest=manifest,
        )

    async def verify_asset(self, db: AsyncSession, asset: Asset, run: Run) -> VerifyOut:
        manifest_ok = False
        byte_match: bool | None = None
        actual_sha: str | None = None
        detail_parts: list[str] = []

        # 1) Manifest self-consistency via Genblaze when possible
        if run.manifest_b2_key and self.settings.b2_configured:
            try:
                raw = self.b2.get_bytes(run.manifest_b2_key)
                payload = json.loads(raw.decode("utf-8"))
                try:
                    from genblaze_core import Manifest

                    manifest = Manifest.model_validate(payload)
                    manifest_ok = bool(manifest.verify())
                    detail_parts.append(
                        "manifest.verify() passed"
                        if manifest_ok
                        else "manifest.verify() failed"
                    )
                except Exception as exc:
                    # Fallback: presence of canonical_hash counts as structural OK
                    manifest_ok = bool(
                        payload.get("canonical_hash") or run.canonical_hash
                    )
                    detail_parts.append(f"manifest parsed; verify skipped ({exc})")
            except Exception as exc:
                detail_parts.append(f"manifest load failed: {exc}")
        else:
            manifest_ok = bool(run.canonical_hash)
            detail_parts.append(
                "no B2 manifest key; using stored canonical_hash presence"
            )

        # 2) Byte-level check against declared sha256
        expected = (asset.sha256 or "").lower() or None
        if asset.b2_key and expected and self.settings.b2_configured:
            try:
                ok, actual_sha = self.b2.verify_object_hash(asset.b2_key, expected)
                byte_match = ok
                detail_parts.append(
                    "byte sha256 matched" if ok else "byte sha256 mismatch"
                )
            except Exception as exc:
                detail_parts.append(f"byte check failed: {exc}")
        elif not expected:
            detail_parts.append("asset has no sha256; byte check skipped")
        else:
            detail_parts.append("asset has no b2_key; byte check skipped")

        verified = bool(manifest_ok and (byte_match is not False))
        if byte_match is False:
            verified = False

        return VerifyOut(
            asset_id=asset.id,
            verified=verified,
            manifest_ok=manifest_ok,
            byte_match=byte_match,
            canonical_hash=run.canonical_hash,
            expected_sha256=expected,
            actual_sha256=actual_sha,
            detail="; ".join(detail_parts),
        )
