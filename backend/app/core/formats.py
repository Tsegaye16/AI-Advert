"""Output format presets for ad placements.

One generation run targets one placement. Keeping the catalogue here means the
API, the ffmpeg providers, and the prompt builder all agree on dimensions.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VideoFormat:
    key: str
    label: str
    width: int
    height: int
    aspect: str
    platforms: tuple[str, ...]
    prompt_hint: str


FORMATS: dict[str, VideoFormat] = {
    "landscape": VideoFormat(
        key="landscape",
        label="Landscape 16:9",
        width=1280,
        height=720,
        aspect="16:9",
        platforms=("YouTube", "Web", "Display"),
        prompt_hint="wide cinematic landscape composition, 16:9 framing",
    ),
    "square": VideoFormat(
        key="square",
        label="Square 1:1",
        width=1080,
        height=1080,
        aspect="1:1",
        platforms=("Instagram feed", "Facebook feed"),
        prompt_hint="centered square composition, 1:1 framing",
    ),
    "portrait": VideoFormat(
        key="portrait",
        label="Portrait 4:5",
        width=1080,
        height=1350,
        aspect="4:5",
        platforms=("Instagram portrait", "Facebook feed"),
        prompt_hint="vertical portrait composition, 4:5 framing, subject centered",
    ),
    "vertical": VideoFormat(
        key="vertical",
        label="Vertical 9:16",
        width=1080,
        height=1920,
        aspect="9:16",
        platforms=("TikTok", "Reels", "Shorts", "Stories"),
        prompt_hint=(
            "full-bleed vertical composition, 9:16 framing, "
            "subject centered with headroom for on-screen text"
        ),
    ),
}

DEFAULT_FORMAT = "landscape"


def get_format(key: str | None) -> VideoFormat:
    """Resolve a format key, falling back to landscape for unknown values."""
    return FORMATS.get((key or "").strip().lower(), FORMATS[DEFAULT_FORMAT])


def format_choices() -> list[dict[str, object]]:
    return [
        {
            "key": f.key,
            "label": f.label,
            "width": f.width,
            "height": f.height,
            "aspect": f.aspect,
            "platforms": list(f.platforms),
        }
        for f in FORMATS.values()
    ]
