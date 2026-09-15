"""Brand logo helpers for image generation steps."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.core.storage import B2Service

logger = logging.getLogger(__name__)


def logo_external_inputs(
    logo_b2_key: str | None,
    b2: B2Service,
) -> list[Any] | None:
    """Brand logo as Genblaze external_inputs (stable sha256 + presigned URL)."""
    if not logo_b2_key:
        return None
    try:
        from genblaze_core.models.asset import Asset as GBAsset

        payload = b2.get_bytes(logo_b2_key)
        sha = b2.sha256_bytes(payload)
        url = b2.presign_get(logo_b2_key)
        ext = Path(logo_b2_key).suffix.lower()
        media = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }.get(ext, "image/png")
        return [GBAsset(url=url, media_type=media, sha256=sha)]
    except Exception as exc:
        logger.warning("Could not presign logo for image steps: %s", exc)
        return None


def provider_accepts_logo_reference(provider: Any) -> bool:
    """True when provider can receive logo via external_inputs / chain."""
    try:
        caps = provider.get_capabilities()
    except Exception:
        return False
    if getattr(caps, "accepts_chain_input", False):
        return True
    supported = getattr(caps, "supported_inputs", ()) or ()
    return "image" in supported
