"""Provider catalog — AdVault switchboard (official Genblaze sample free path).

Default preference (no paid credits needed for core slots):
  image: nvidia → decart → replicate
  video: local (ffmpeg kenburns) → decart → nvidia → …
  tts:   edge → elevenlabs → lmnt → nvidia
  music: skipped by default (needs Replicate/GMI credits)

NVIDIA Cosmos + Magpie probe DEAD on free NIM. Decart retired lucy-*-i2v
in the Python SDK — use local FFmpeg still→video for Full Ad.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.config import Settings, get_settings

IMAGE, VIDEO, TTS, MUSIC = "image", "video", "tts", "music"


@dataclass(frozen=True)
class CatalogEntry:
    slot: str
    vendor: str
    env_attr: str
    default_model: str
    suggested_models: tuple[str, ...]
    make: Callable[[Settings], Any]
    image_handoff: str | None = None  # video only: external_inputs | image_kwarg


def _catalog(settings: Settings) -> dict[str, dict[str, CatalogEntry]]:
    return {
        IMAGE: {
            "nvidia": CatalogEntry(
                slot=IMAGE,
                vendor="nvidia",
                env_attr="nvidia_api_key",
                default_model="black-forest-labs/flux.1-schnell",
                suggested_models=(
                    "black-forest-labs/flux.1-schnell",
                    "stabilityai/stable-diffusion-3-5-large",
                ),
                make=lambda s: _nvidia_image(s),
            ),
            "decart": CatalogEntry(
                slot=IMAGE,
                vendor="decart",
                env_attr="decart_api_key",
                # lucy-pro-t2i was retired; use lucy-image-2 via blank-canvas edit.
                default_model="lucy-image-2",
                suggested_models=("lucy-image-2", "lucy-image-latest"),
                make=lambda s: _decart_image(s),
            ),
            "replicate": CatalogEntry(
                slot=IMAGE,
                vendor="replicate",
                env_attr="replicate_api_token",
                default_model="black-forest-labs/flux-schnell",
                suggested_models=(
                    "black-forest-labs/flux-schnell",
                    "black-forest-labs/flux-dev",
                ),
                make=lambda s: _replicate(s),
            ),
        },
        VIDEO: {
            "local": CatalogEntry(
                slot=VIDEO,
                vendor="local",
                env_attr="always",
                default_model="kenburns",
                suggested_models=("kenburns", "still"),
                make=lambda s: _local_video(s),
                image_handoff="external_inputs",
            ),
            "decart": CatalogEntry(
                slot=VIDEO,
                vendor="decart",
                env_attr="decart_api_key",
                # SDK no longer ships lucy-*-i2v; lucy-2.1 is video-edit (needs mp4).
                default_model="lucy-2.1",
                suggested_models=("lucy-2.1", "lucy-clip"),
                make=lambda s: _decart_video(s),
                image_handoff="external_inputs",
            ),
            "nvidia": CatalogEntry(
                slot=VIDEO,
                vendor="nvidia",
                env_attr="nvidia_api_key",
                # text2world is image-conditioned; video2world needs a video input
                default_model="nvidia/cosmos-2.0-diffusion-text2world",
                suggested_models=(
                    "nvidia/cosmos-2.0-diffusion-text2world",
                    "nvidia/cosmos-2.0-diffusion-video2world",
                ),
                make=lambda s: _nvidia_video(s),
                image_handoff="external_inputs",
            ),
            "replicate": CatalogEntry(
                slot=VIDEO,
                vendor="replicate",
                env_attr="replicate_api_token",
                default_model="minimax/video-01",
                suggested_models=(
                    "minimax/video-01",
                    "kwaivgi/kling-v2.1",
                    "wan-video/wan-2.5-i2v",
                ),
                make=lambda s: _replicate(s),
                image_handoff="external_inputs",
            ),
            "gmicloud": CatalogEntry(
                slot=VIDEO,
                vendor="gmicloud",
                env_attr="gmicloud_api_key",
                default_model="Kling-Image2Video-V2.1-Master",
                suggested_models=(
                    "Kling-Image2Video-V2.1-Master",
                    "pixverse-v5.6-i2v",
                ),
                make=lambda s: _gmi_video(s),
                image_handoff="external_inputs",
            ),
        },
        TTS: {
            # Local free TTS — NVIDIA Magpie is currently DEAD on free NIM genai.
            "edge": CatalogEntry(
                slot=TTS,
                vendor="edge",
                env_attr="always",
                default_model="en-US-JennyNeural",
                suggested_models=(
                    "en-US-JennyNeural",
                    "en-US-GuyNeural",
                    "en-GB-SoniaNeural",
                ),
                make=lambda s: _edge_tts(s),
            ),
            "nvidia": CatalogEntry(
                slot=TTS,
                vendor="nvidia",
                env_attr="nvidia_api_key",
                default_model="nvidia/magpie-tts-multilingual",
                suggested_models=("nvidia/magpie-tts-multilingual",),
                make=lambda s: _nvidia_audio(s),
            ),
            "elevenlabs": CatalogEntry(
                slot=TTS,
                vendor="elevenlabs",
                env_attr="elevenlabs_api_key",
                default_model="eleven_multilingual_v2",
                suggested_models=(
                    "eleven_multilingual_v2",
                    "eleven_flash_v2_5",
                    "eleven_v3",
                ),
                make=lambda s: _elevenlabs(s),
            ),
            "lmnt": CatalogEntry(
                slot=TTS,
                vendor="lmnt",
                env_attr="lmnt_api_key",
                default_model="aurora",
                suggested_models=("aurora", "blizzard"),
                make=lambda s: _lmnt(s),
            ),
        },
        MUSIC: {
            "replicate": CatalogEntry(
                slot=MUSIC,
                vendor="replicate",
                env_attr="replicate_api_token",
                default_model="meta/musicgen",
                suggested_models=("meta/musicgen",),
                make=lambda s: _replicate(s),
            ),
            "gmicloud": CatalogEntry(
                slot=MUSIC,
                vendor="gmicloud",
                env_attr="gmicloud_api_key",
                default_model="minimax-music-2.5",
                suggested_models=("minimax-music-2.5",),
                make=lambda s: _gmi_audio(s),
            ),
        },
    }


# Free-first order. edge TTS needs no key; NVIDIA Magpie genai probe is DEAD.
_SLOT_PREFERENCE: dict[str, tuple[str, ...]] = {
    IMAGE: ("nvidia", "decart", "replicate"),
    VIDEO: ("local", "decart", "nvidia", "replicate", "gmicloud"),
    TTS: ("edge", "elevenlabs", "lmnt", "nvidia"),
    MUSIC: ("replicate", "gmicloud"),
}


def _replicate(settings: Settings):
    from genblaze_replicate import ReplicateProvider

    return ReplicateProvider(api_token=settings.replicate_api_token)


def _nvidia_image(settings: Settings):
    from genblaze_nvidia import NvidiaImageProvider

    # Default 120s is too low on free NIM queues — bump wait window.
    return NvidiaImageProvider(
        api_key=settings.nvidia_api_key,
        http_timeout=600.0,
        nvcf_timeout=600.0,
    )


def _nvidia_video(settings: Settings):
    from genblaze_nvidia import NvidiaVideoProvider

    return NvidiaVideoProvider(
        api_key=settings.nvidia_api_key,
        http_timeout=600.0,
    )


def _edge_tts(settings: Settings):
    from app.core.edge_tts import EdgeTTSProvider

    return EdgeTTSProvider(output_dir=settings.output_dir)


def _nvidia_audio(settings: Settings):
    from genblaze_nvidia import NvidiaAudioProvider

    return NvidiaAudioProvider(
        api_key=settings.nvidia_api_key,
        http_timeout=300.0,
        nvcf_timeout=300.0,
    )


def _local_video(settings: Settings):
    from app.core.local_video import LocalStillVideoProvider

    return LocalStillVideoProvider(
        ffmpeg_path=settings.ffmpeg_path,
        output_dir=settings.output_dir,
    )


def _decart_video(settings: Settings):
    from genblaze_decart import DecartVideoProvider

    return DecartVideoProvider(api_key=settings.decart_api_key)


def _decart_image(settings: Settings):
    import tempfile
    from pathlib import Path

    from app.core.decart_t2i import DecartCanvasImageProvider

    # Always under system temp so ObjectStorageSink allowlist accepts the file.
    out = Path(tempfile.gettempdir()) / "advault-decart"
    out.mkdir(parents=True, exist_ok=True)
    return DecartCanvasImageProvider(
        api_key=settings.decart_api_key,
        output_dir=out,
    )


def _elevenlabs(settings: Settings):
    from genblaze_elevenlabs import ElevenLabsTTSProvider

    return ElevenLabsTTSProvider(api_key=settings.elevenlabs_api_key)


def _lmnt(settings: Settings):
    from genblaze_lmnt import LMNTProvider

    return LMNTProvider(api_key=settings.lmnt_api_key)


def _gmi_video(settings: Settings):
    from genblaze_gmicloud import GMICloudVideoProvider

    return GMICloudVideoProvider(api_key=settings.gmicloud_api_key)


def _gmi_audio(settings: Settings):
    from genblaze_gmicloud import GMICloudAudioProvider

    return GMICloudAudioProvider(api_key=settings.gmicloud_api_key)


def image_vendor_fallback_order(
    preferred_vendor: str | None = None,
    settings: Settings | None = None,
) -> list[str]:
    """Configured image vendors to try, preferred first."""
    settings = settings or get_settings()
    catalog = _catalog(settings)
    order = list(_SLOT_PREFERENCE[IMAGE])
    pref = (preferred_vendor or settings.image_vendor or "").strip().lower()
    if pref:
        order = [pref] + [v for v in order if v != pref]
    return [
        v
        for v in order
        if v in catalog[IMAGE] and key_available(catalog[IMAGE][v], settings)
    ]


def key_available(entry: CatalogEntry, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    if entry.env_attr in ("", "always", "*"):
        return True
    return bool(getattr(settings, entry.env_attr, "") or "")


def resolve_slot(
    slot: str,
    *,
    vendor: str | None = None,
    model: str | None = None,
    settings: Settings | None = None,
) -> tuple[Any, str, str, CatalogEntry]:
    """Return (provider_instance, model_id, vendor, entry)."""
    settings = settings or get_settings()
    catalog = _catalog(settings)
    if slot not in catalog:
        raise ValueError(f"Unknown slot: {slot}")

    preferred_vendor = (vendor or "").strip().lower()
    if not preferred_vendor:
        preferred_vendor = {
            IMAGE: settings.image_vendor,
            VIDEO: settings.video_vendor,
            TTS: settings.tts_vendor,
            MUSIC: settings.music_vendor,
        }.get(slot, "")
        preferred_vendor = (preferred_vendor or "").strip().lower()

    order = list(_SLOT_PREFERENCE.get(slot, ()))
    if preferred_vendor:
        order = [preferred_vendor] + [v for v in order if v != preferred_vendor]

    last_err: Exception | None = None
    for name in order:
        entry = catalog[slot].get(name)
        if entry is None or not key_available(entry, settings):
            continue
        try:
            provider = entry.make(settings)
            model_id = model or entry.default_model
            if not model:
                env_model = {
                    IMAGE: settings.image_model,
                    VIDEO: settings.video_model,
                    TTS: settings.voice_model,
                    MUSIC: settings.music_model,
                }.get(slot)
                if env_model and _model_looks_compatible(name, env_model):
                    model_id = env_model
            return provider, model_id, name, entry
        except Exception as exc:
            last_err = exc
            continue

    raise RuntimeError(
        f"No configured provider for slot={slot!r}. "
        f"Set NVIDIA_API_KEY (recommended free path) or REPLICATE_API_TOKEN. "
        f"See official genblaze multi-provider sample. "
        f"Last error: {last_err}"
    )


def _model_looks_compatible(vendor: str, model: str) -> bool:
    m = model.lower()
    if vendor == "replicate":
        return "/" in model and "kling-image2video" not in m and not m.startswith(
            "seedream"
        )
    if vendor == "nvidia":
        return (
            "nvidia/" in m
            or "black-forest-labs/" in m
            or "stabilityai/" in m
        )
    if vendor == "decart":
        # Image: lucy-image-*; video-edit: lucy-2.1 / lucy-clip (i2v retired in SDK)
        return "lucy" in m
    if vendor == "local":
        return m in {"kenburns", "still", "local-video"} or "kenburn" in m
    if vendor == "edge":
        return "neural" in m or m.startswith("edge/")
    if vendor == "openai":
        return any(
            x in m
            for x in ("dall-e", "gpt-image", "sora", "tts", "gpt-4o-mini-tts")
        )
    if vendor == "elevenlabs":
        return "eleven" in m
    if vendor == "lmnt":
        return m in {"aurora", "blizzard"} or "lmnt" in m
    if vendor == "gmicloud":
        return "/" not in model
    return True


def provider_matrix(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    catalog = _catalog(settings)
    matrix: dict[str, list[dict[str, Any]]] = {}
    selected: dict[str, dict[str, str]] = {}
    for slot in (IMAGE, VIDEO, TTS, MUSIC):
        matrix[slot] = []
        for entry in catalog[slot].values():
            available = key_available(entry, settings)
            matrix[slot].append(
                {
                    "vendor": entry.vendor,
                    "default_model": entry.default_model,
                    "suggested_models": list(entry.suggested_models),
                    "key_available": available,
                    "image_handoff": entry.image_handoff,
                }
            )
        try:
            _, model_id, vendor, _ = resolve_slot(slot, settings=settings)
            selected[slot] = {"vendor": vendor, "model": model_id}
        except RuntimeError:
            selected[slot] = {"vendor": "", "model": ""}
    return {
        "keys": {
            "b2": settings.b2_configured,
            "openai": settings.openai_configured,
            "replicate": settings.replicate_configured,
            "nvidia": settings.nvidia_configured,
            "decart": settings.decart_configured,
            "elevenlabs": bool(settings.elevenlabs_api_key),
            "lmnt": bool(settings.lmnt_api_key),
            "gmicloud": settings.gmicloud_configured,
        },
        "demo_mode": settings.demo_mode,
        "matrix": matrix,
        "selected": selected,
        "hint": (
            "Full Ad: Decart image → local FFmpeg Ken Burns video → edge-tts. "
            "Music skipped unless you have Replicate/GMI credits. "
            "NVIDIA Cosmos/Magpie and Decart lucy-*-i2v are unavailable on free path."
        ),
    }
