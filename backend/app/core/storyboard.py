"""Scene-by-scene storyboard planning and per-scene image generation."""

from __future__ import annotations

import re
import uuid
from typing import Any

from genblaze_core.models.asset import Asset
from genblaze_core.models.enums import Modality
from genblaze_core.models.step import Step

SCENE_TITLES = (
    "Opening hook",
    "Context",
    "Product in action",
    "Key benefit",
    "Social proof",
    "Feature highlight",
    "Lifestyle moment",
    "Comparison beat",
    "Urgency",
    "Call to action",
)


def generate_voice_lines(
    *,
    product_name: str,
    product_description: str,
    audience: str,
    tone: str,
    cta: str,
    scene_count: int,
) -> list[str]:
    """Build one narration line per scene when the user leaves VO empty."""
    desc = (product_description or product_name).strip()
    desc_short = desc[:120] if desc else product_name
    aud = (audience or "everyone").strip()
    tone_word = (tone or "confident").strip()
    cta_text = (cta or "Shop now").strip()
    count = max(2, min(10, scene_count or 4))

    beats = [
        f"Meet {product_name} — made for {aud}.",
        f"Every day, {aud} deserve something better.",
        desc_short if desc_short.endswith(".") else f"{desc_short}.",
        f"That's why we built {product_name}.",
        f"{tone_word.capitalize()} quality you can feel.",
        f"See {product_name} in action.",
        f"Real results for real people.",
        f"Trusted by {aud} everywhere.",
        f"Don't miss out on the difference.",
    ]
    cta_line = f"{cta_text}. Get {product_name} today."
    if count == 1:
        return [cta_line]
    body = beats[: max(1, count - 1)]
    while len(body) < count - 1:
        body.append(body[-1])
    return body + [cta_line]


def split_voice_lines(
    voiceover: str,
    *,
    max_scenes: int = 10,
    min_scenes: int = 2,
) -> list[str]:
    """Split narration into scene-sized lines (one visual beat per line)."""
    text = (voiceover or "").strip()
    if not text:
        return []

    parts = re.split(r"(?<=[.!?])\s+", text)
    parts = [p.strip() for p in parts if p.strip()]

    if len(parts) >= min_scenes:
        return parts[:max_scenes]

    # Fall back to comma chunks or word windows.
    if "," in text:
        comma_parts = [p.strip() for p in text.split(",") if p.strip()]
        if len(comma_parts) >= min_scenes:
            return comma_parts[:max_scenes]

    words = text.split()
    if len(words) < min_scenes * 3:
        return [text]

    chunk = max(3, len(words) // min_scenes)
    lines: list[str] = []
    for i in range(0, len(words), chunk):
        line = " ".join(words[i : i + chunk]).strip()
        if line:
            lines.append(line)
        if len(lines) >= max_scenes:
            break
    return lines[:max_scenes] or [text]


def scene_durations_from_lines(
    lines: list[str],
    *,
    total_seconds: float = 14.0,
    min_seconds: float = 2.0,
) -> list[float]:
    """Weight scene clip length by narration words (feels synced to VO)."""
    if not lines:
        return []
    weights = [max(len(line.split()), 1) for line in lines]
    total_w = sum(weights)
    raw = [total_seconds * w / total_w for w in weights]
    return [max(min_seconds, round(d, 2)) for d in raw]


def build_scene_prompt(
    *,
    product_name: str,
    product_description: str,
    audience: str,
    tone: str,
    voice_line: str,
    scene_index: int,
    title: str,
) -> str:
    """Turn product context + VO line into an image prompt for one scene."""
    desc = (product_description or "").strip()
    desc_bit = f"{desc[:160]} " if desc else ""
    aud = audience or "general consumers"
    templates = [
        (
            f"Cinematic wide lifestyle photograph introducing {product_name}. "
            f"{desc_bit}Mood: {tone}. Visualize this narration: \"{voice_line}\". "
            f"Audience: {aud}. Premium commercial photography, natural light, no text."
        ),
        (
            f"Relatable everyday scene showing the problem or moment before using "
            f"{product_name}. {desc_bit}Tone: {tone}. Narration beat: \"{voice_line}\". "
            f"Documentary ad style, authentic, no text overlays."
        ),
        (
            f"Dynamic mid-shot of {product_name} being used in real life. "
            f"{desc_bit}{tone} energy. Narration: \"{voice_line}\". "
            f"Sharp product focus, shallow depth of field, commercial ad frame."
        ),
        (
            f"Close-up hero detail of {product_name} highlighting a key benefit. "
            f"{desc_bit}Narration: \"{voice_line}\". {tone} premium look, "
            f"macro product photography, clean background, no text."
        ),
        (
            f"Confident brand closing shot with {product_name} centered, ready to buy. "
            f"{desc_bit}Narration: \"{voice_line}\". {tone} CTA moment, "
            f"studio lighting, aspirational, no text or logos added."
        ),
    ]
    template = templates[scene_index % len(templates)]
    return f"Scene {scene_index + 1} — {title}. {template}"


def plan_scenes(
    *,
    product_name: str,
    product_description: str,
    audience: str,
    tone: str,
    voiceover: str,
    cta: str = "Shop now",
    scene_count: int | None = None,
) -> list[dict[str, Any]]:
    """Build storyboard scene rows (prompt + voice line, no images yet)."""
    target_count = max(2, min(10, scene_count or 4))
    voice_text = (voiceover or "").strip()

    if voice_text:
        lines = split_voice_lines(voice_text, max_scenes=10, min_scenes=2)
    else:
        lines = generate_voice_lines(
            product_name=product_name,
            product_description=product_description,
            audience=audience,
            tone=tone,
            cta=cta,
            scene_count=target_count,
        )

    if scene_count and scene_count > 0:
        if len(lines) > scene_count:
            lines = lines[:scene_count]
        while len(lines) < scene_count:
            lines.append(lines[-1])

    scenes: list[dict[str, Any]] = []
    for idx, line in enumerate(lines):
        title = SCENE_TITLES[idx] if idx < len(SCENE_TITLES) else f"Scene {idx + 1}"
        scenes.append(
            {
                "index": idx,
                "title": title,
                "voice_line": line,
                "prompt": build_scene_prompt(
                    product_name=product_name,
                    product_description=product_description,
                    audience=audience,
                    tone=tone,
                    voice_line=line,
                    scene_index=idx,
                    title=title,
                ),
                "asset_id": None,
                "status": "planned",
            }
        )
    return scenes


def _asset_to_dict(
    asset: Asset,
    *,
    step_name: str,
    provider: str,
    model: str,
    b2,
) -> dict[str, Any]:
    url = getattr(asset, "url", None)
    media_type = getattr(asset, "media_type", "") or "image/png"
    key = b2.key_from_url(url) if url else None
    return {
        "kind": "image",
        "step_name": step_name,
        "provider": provider,
        "model": model,
        "url": url,
        "b2_key": key,
        "sha256": getattr(asset, "sha256", None),
        "mime": media_type,
        "width": getattr(asset, "width", None),
        "height": getattr(asset, "height", None),
        "duration_ms": None,
    }


def generate_scene_image(
    *,
    prompt: str,
    run_id: str,
    scene_index: int,
    image_provider,
    image_model: str,
    image_vendor: str,
    provider_name: str,
    b2,
    logo_b2_key: str | None = None,
) -> dict[str, Any]:
    """Generate one scene still via the configured image provider."""
    from app.core.branding import logo_external_inputs, provider_accepts_logo_reference

    step_id = f"{run_id}-scene-{scene_index}-{uuid.uuid4().hex[:8]}"
    logo_inputs = (
        logo_external_inputs(logo_b2_key, b2)
        if provider_accepts_logo_reference(image_provider)
        else None
    )
    step = Step(
        step_id=step_id,
        provider=provider_name,
        model=image_model,
        prompt=prompt,
        modality=Modality.IMAGE,
        inputs=logo_inputs or [],
    )
    result = image_provider.generate(step)
    if not result.assets:
        raise RuntimeError(f"Scene {scene_index + 1} image provider returned no asset")
    return _asset_to_dict(
        result.assets[0],
        step_name=f"scene-{scene_index + 1}",
        provider=image_vendor,
        model=image_model,
        b2=b2,
    )
