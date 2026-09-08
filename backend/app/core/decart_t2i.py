"""Decart Canvas → Image provider.

Current Decart API only exposes ``lucy-image-2`` (image→image edit), not
``lucy-pro-t2i`` (retired). We blank-canvas + edit, then upload bytes to B2
immediately so Genblaze's Windows ``file://`` allowlist bug is avoided.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from genblaze_core._utils import _run_async
from genblaze_core.exceptions import ProviderError
from genblaze_core.models.asset import Asset
from genblaze_core.models.enums import Modality, ProviderErrorCode
from genblaze_core.models.step import Step
from genblaze_core.providers import (
    DiscoverySupport,
    ModelFamily,
    ModelRegistry,
    ModelSpec,
    ProviderCapabilities,
    SyncProvider,
)
from genblaze_core.providers.retry import retry_after_from_response
from genblaze_core.runnable.config import RunnableConfig

logger = logging.getLogger(__name__)


def _blank_canvas_png(width: int = 832, height: int = 480) -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), (235, 235, 238))
    draw = ImageDraw.Draw(img)
    draw.rectangle((40, 40, width - 40, height - 40), outline=(200, 200, 205), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _is_transient(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return any(
        token in msg
        for token in ("504", "502", "503", "timeout", "timed out", "gateway")
    )


def _upload_png_to_b2(payload: bytes, step_id: str) -> tuple[str, str]:
    """Upload PNG to B2 and return (presigned HTTPS URL, sha256).

    Genblaze's ``_read_local_file`` mis-parses Windows ``file:///C:/...`` URLs
    into ``C:Users\\...`` (missing slash), then fails the temp-dir allowlist.
    HTTPS sidesteps that path entirely; the sink re-fetches and stores durably.
    """
    from app.config import get_settings
    from app.core.storage import B2Service

    settings = get_settings()
    sha = hashlib.sha256(payload).hexdigest()
    key = f"{settings.b2_prefix}/inbox/{step_id or uuid.uuid4().hex}.png"
    b2 = B2Service(settings)
    b2.put_bytes(key, payload, content_type="image/png")
    return b2.presign_get(key), sha


class DecartCanvasImageProvider(SyncProvider):
    """Text prompt → blank canvas → Decart lucy-image-2 edit → B2 HTTPS URL."""

    name = "decart-canvas-image"
    discovery_support = DiscoverySupport.NONE

    @classmethod
    def create_registry(cls) -> ModelRegistry:
        family = ModelFamily(
            name="decart-lucy-image-edit",
            pattern=__import__("re").compile(r"^lucy-image(?:-2|-latest)?$"),
            spec_template=ModelSpec(model_id="*", modality=Modality.IMAGE),
            description="Decart Lucy Image edit models (canvas workaround for t2i).",
            example_slugs=("lucy-image-2", "lucy-image-latest"),
        )
        return ModelRegistry(
            provider_families=(family,),
            fallback=ModelSpec(model_id="*", modality=Modality.IMAGE),
        )

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.IMAGE],
            supported_inputs=["text", "image"],
            accepts_chain_input=True,
            output_formats=["image/png"],
            models=["lucy-image-2", "lucy-image-latest"],
        )

    def __init__(
        self,
        api_key: str | None = None,
        output_dir: str | Path | None = None,
        *,
        max_attempts: int = 3,
    ):
        super().__init__()
        self._api_key = api_key or os.environ.get("DECART_API_KEY")
        self._output_dir = Path(output_dir) if output_dir else None
        self._max_attempts = max_attempts

    def _new_client(self):
        """Fresh Decart client per call — cached aiohttp sessions break after asyncio.run()."""
        try:
            from decart import DecartClient
        except ImportError as exc:
            raise ProviderError(
                "decart package not installed. Run: pip install decart",
                error_code=ProviderErrorCode.CONFIG_ERROR,
            ) from exc
        kwargs: dict = {}
        if self._api_key:
            kwargs["api_key"] = self._api_key
        return DecartClient(**kwargs)

    @staticmethod
    def _close_client(client: Any) -> None:
        try:
            _run_async(client.close())
        except Exception as exc:
            logger.debug("Decart client close: %s", exc)

    def generate(self, step: Step, config: RunnableConfig | None = None) -> Step:
        if not self._api_key:
            raise ProviderError(
                "No Decart API key. Set DECART_API_KEY.",
                error_code=ProviderErrorCode.AUTH_FAILURE,
            )

        model_id = step.model or "lucy-image-2"
        prompt = (step.prompt or "").strip()
        if not prompt:
            raise ProviderError(
                "Empty prompt for Decart canvas image.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        short = prompt if len(prompt) <= 280 else prompt[:277] + "..."
        edit_prompt = (
            f"Replace the entire blank canvas with this scene (full-frame photo): {short}"
        )

        canvas = _blank_canvas_png()
        for asset in getattr(step, "inputs", None) or []:
            mt = (getattr(asset, "media_type", "") or "").lower()
            url = getattr(asset, "url", None)
            if mt.startswith("image/") and url:
                try:
                    import httpx

                    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                        resp = client.get(url)
                        resp.raise_for_status()
                        canvas = resp.content
                    edit_prompt = (
                        f"Create this advertising scene while preserving the brand logo "
                        f"from the reference image: {short}"
                    )
                    break
                except Exception as exc:
                    logger.warning("Could not load logo reference for Decart: %s", exc)
        last_exc: BaseException | None = None

        for attempt in range(1, self._max_attempts + 1):
            client = self._new_client()
            try:
                from decart import models

                data_buf = io.BytesIO(canvas)
                data_buf.name = "canvas.png"
                params: dict[str, Any] = {
                    "model": models.image(model_id),  # type: ignore[arg-type]
                    "prompt": edit_prompt[:1000],
                    "data": data_buf,
                    "resolution": "480p",
                }
                result = _run_async(client.process(params))
                payload = getattr(result, "data", None) or result
                if hasattr(payload, "read"):
                    payload = payload.read()
                if not isinstance(payload, (bytes, bytearray)):
                    payload = bytes(payload)

                # Keep a local copy for debugging; primary asset URL is HTTPS on B2
                # to avoid Genblaze Windows file:// allowlist bug (C:Users\... path).
                if self._output_dir:
                    out_dir = Path(self._output_dir).resolve()
                else:
                    out_dir = Path(tempfile.gettempdir()) / "advault-decart"
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = (out_dir / f"{step.step_id}.png").resolve()
                out_path.write_bytes(payload)

                try:
                    url, sha = _upload_png_to_b2(bytes(payload), step.step_id)
                    asset = Asset(url=url, media_type="image/png", sha256=sha)
                except Exception as upload_exc:
                    logger.warning(
                        "B2 inbox upload failed (%s); falling back to file URI",
                        upload_exc,
                    )
                    # Last resort — may fail on Windows sink allowlist
                    asset = Asset(url=out_path.as_uri(), media_type="image/png")

                step.assets.append(asset)
                return step
            except ProviderError:
                raise
            except Exception as exc:
                last_exc = exc
                loop_closed = "event loop is closed" in str(exc).lower()
                retryable = attempt < self._max_attempts and (
                    loop_closed or _is_transient(exc)
                )
                if retryable:
                    if loop_closed:
                        logger.warning(
                            "Decart stale session (attempt %s/%s) — retrying",
                            attempt,
                            self._max_attempts,
                        )
                    else:
                        wait = attempt * 3
                        logger.warning(
                            "Decart transient error (attempt %s/%s): %s — retry in %ss",
                            attempt,
                            self._max_attempts,
                            exc,
                            wait,
                        )
                        time.sleep(wait)
                    continue
                raise ProviderError(
                    f"Decart canvas image failed: {exc}",
                    error_code=ProviderErrorCode.MODEL_ERROR,
                    retry_after=retry_after_from_response(exc),
                ) from exc
            finally:
                self._close_client(client)

        raise ProviderError(
            f"Decart canvas image failed after retries: {last_exc}",
            error_code=ProviderErrorCode.MODEL_ERROR,
        )
