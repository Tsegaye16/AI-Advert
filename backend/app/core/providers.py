"""Provider wiring for Genblaze steps — thin wrappers over the catalog."""

from __future__ import annotations

import logging
import os
from typing import Any

from app.config import Settings, get_settings
from app.core.catalog import IMAGE, MUSIC, TTS, VIDEO, provider_matrix, resolve_slot
from app.core.formats import get_format

logger = logging.getLogger(__name__)


def _ensure_provider_env(settings: Settings) -> None:
    if settings.gmicloud_api_key:
        os.environ["GMI_API_KEY"] = settings.gmicloud_api_key
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    if settings.replicate_api_token:
        os.environ["REPLICATE_API_TOKEN"] = settings.replicate_api_token
    if settings.nvidia_api_key:
        os.environ["NVIDIA_API_KEY"] = settings.nvidia_api_key
    if settings.decart_api_key:
        os.environ["DECART_API_KEY"] = settings.decart_api_key
    if settings.b2_key_id:
        os.environ["B2_KEY_ID"] = settings.b2_key_id
    if settings.b2_application_key:
        os.environ["B2_APPLICATION_KEY"] = settings.b2_application_key
        os.environ["B2_APP_KEY"] = settings.b2_application_key


def get_image_provider(
    settings: Settings | None = None,
    *,
    vendor: str | None = None,
    model: str | None = None,
):
    settings = settings or get_settings()
    _ensure_provider_env(settings)
    provider, model_id, vendor_id, _ = resolve_slot(
        IMAGE, vendor=vendor, model=model, settings=settings
    )
    return provider, model_id, vendor_id


def get_video_provider(
    settings: Settings | None = None,
    *,
    vendor: str | None = None,
    model: str | None = None,
    video_format: str | None = None,
):
    settings = settings or get_settings()
    _ensure_provider_env(settings)
    provider, model_id, vendor_id, entry = resolve_slot(
        VIDEO, vendor=vendor, model=model, settings=settings
    )
    # Only the local ffmpeg renderer can honour an arbitrary output size.
    if video_format and hasattr(provider, "_width"):
        fmt = get_format(video_format)
        provider._width = fmt.width
        provider._height = fmt.height
    fallbacks = list(settings.video_fallback_models) if settings.video_fallback_models else []
    return provider, model_id, fallbacks, vendor_id, entry.image_handoff or "external_inputs"


def get_voice_provider(
    settings: Settings | None = None,
    *,
    vendor: str | None = None,
    model: str | None = None,
):
    settings = settings or get_settings()
    _ensure_provider_env(settings)
    provider, model_id, vendor_id, _ = resolve_slot(
        TTS, vendor=vendor, model=model, settings=settings
    )
    return provider, model_id, vendor_id


def get_music_provider(
    settings: Settings | None = None,
    *,
    vendor: str | None = None,
    model: str | None = None,
):
    settings = settings or get_settings()
    _ensure_provider_env(settings)
    provider, model_id, vendor_id, _ = resolve_slot(
        MUSIC, vendor=vendor, model=model, settings=settings
    )
    return provider, model_id, vendor_id


def get_compositor(settings: Settings | None = None):
    from app.core.local_mux import LocalMuxProvider

    settings = settings or get_settings()
    return LocalMuxProvider(
        output_dir=settings.output_dir,
        ffmpeg_path=settings.ffmpeg_path,
    )


def provider_status(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    matrix = provider_matrix(settings)
    selected = matrix.get("selected", {})
    keys = matrix.get("keys", {})
    return {
        "b2": settings.b2_configured,
        "openai": settings.openai_configured,
        "replicate": settings.replicate_configured,
        "nvidia": settings.nvidia_configured,
        "elevenlabs": settings.elevenlabs_configured,
        "lmnt": settings.lmnt_configured,
        "gmicloud": settings.gmicloud_configured,
        "demo_mode": settings.demo_mode,
        "selected": selected,
        "keys": keys,
        "image_model": (selected.get("image") or {}).get("model", settings.image_model),
        "video_model": (selected.get("video") or {}).get("model", settings.video_model),
        "voice_model": (selected.get("tts") or {}).get("model", settings.voice_model),
        "music_model": (selected.get("music") or {}).get("model", settings.music_model),
        "matrix": matrix.get("matrix"),
        "hint": matrix.get("hint"),
    }
