"""Local free TTS via Microsoft Edge neural voices (edge-tts).

NVIDIA Magpie TTS currently probes DEAD on the free NIM genai endpoint, and
ElevenLabs/LMNT/OpenAI need keys/credits. Edge voices need no API key.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import tempfile
import uuid
from pathlib import Path
from typing import Any

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
from genblaze_core.runnable.config import RunnableConfig

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "en-US-JennyNeural"


def _upload_mp3_to_b2(payload: bytes, step_id: str) -> tuple[str, str]:
    from app.config import get_settings
    from app.core.storage import B2Service

    settings = get_settings()
    sha = hashlib.sha256(payload).hexdigest()
    key = f"{settings.b2_prefix}/inbox/{step_id or uuid.uuid4().hex}.mp3"
    b2 = B2Service(settings)
    b2.put_bytes(key, payload, content_type="audio/mpeg")
    return b2.presign_get(key), sha


class EdgeTTSProvider(SyncProvider):
    """Text → MP3 using edge-tts (no cloud API key)."""

    name = "edge-tts"
    discovery_support = DiscoverySupport.NONE

    @classmethod
    def create_registry(cls) -> ModelRegistry:
        import re

        family = ModelFamily(
            name="edge-neural-voices",
            pattern=re.compile(r"^.+-Neural$|^edge-"),
            spec_template=ModelSpec(model_id="*", modality=Modality.AUDIO),
            description="Microsoft Edge neural TTS voices via edge-tts.",
            example_slugs=(DEFAULT_VOICE, "en-US-GuyNeural", "en-GB-SoniaNeural"),
        )
        return ModelRegistry(
            provider_families=(family,),
            fallback=ModelSpec(model_id="*", modality=Modality.AUDIO),
        )

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.AUDIO],
            supported_inputs=["text"],
            # Full ad pipeline runs with chain=True (image → video → voice).
            # Voiceover ignores prior assets, but must accept the chain link.
            accepts_chain_input=True,
            output_formats=["audio/mpeg"],
            models=[DEFAULT_VOICE, "en-US-GuyNeural", "en-GB-SoniaNeural"],
        )

    def __init__(self, output_dir: str | Path | None = None):
        super().__init__()
        self._output_dir = Path(output_dir) if output_dir else None

    def generate(self, step: Step, config: RunnableConfig | None = None) -> Step:
        try:
            import edge_tts  # noqa: F401
        except ImportError as exc:
            raise ProviderError(
                "edge-tts not installed. Run: pip install edge-tts",
                error_code=ProviderErrorCode.CONFIG_ERROR,
            ) from exc

        text = (step.prompt or "").strip()
        if not text:
            raise ProviderError(
                "Empty prompt for Edge TTS.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        voice = (step.model or DEFAULT_VOICE).strip() or DEFAULT_VOICE
        # Allow model ids like edge/en-US-JennyNeural
        if voice.startswith("edge/"):
            voice = voice[len("edge/") :]

        try:
            payload = asyncio.run(self._synthesize(text, voice))
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(
                f"Edge TTS failed: {exc}",
                error_code=ProviderErrorCode.MODEL_ERROR,
            ) from exc

        if self._output_dir:
            out_dir = Path(self._output_dir).resolve()
        else:
            out_dir = Path(tempfile.gettempdir()) / "advault-tts"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = (out_dir / f"{step.step_id}.mp3").resolve()
        out_path.write_bytes(payload)

        try:
            url, sha = _upload_mp3_to_b2(payload, step.step_id)
            asset = Asset(url=url, media_type="audio/mpeg", sha256=sha)
        except Exception as upload_exc:  # noqa: BLE001
            logger.warning("B2 inbox upload failed for TTS (%s); using file URI", upload_exc)
            asset = Asset(url=out_path.as_uri(), media_type="audio/mpeg")

        step.assets.append(asset)
        return step

    @staticmethod
    async def _synthesize(text: str, voice: str) -> bytes:
        import edge_tts

        communicate = edge_tts.Communicate(text[:5000], voice)
        chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                chunks.append(chunk["data"])
        if not chunks:
            raise RuntimeError("edge-tts returned no audio data")
        return b"".join(chunks)
