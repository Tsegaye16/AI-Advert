"""Genblaze pipeline definitions for AdVault."""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from app.config import Settings, get_settings
from app.core import providers as provider_factory
from app.core.branding import logo_external_inputs, provider_accepts_logo_reference
from app.core.storage import B2Service, build_object_storage_sink

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    mode: str
    genblaze_run_id: Optional[str]
    canonical_hash: Optional[str]
    manifest_verified: bool
    manifest_dict: dict[str, Any] = field(default_factory=dict)
    assets: list[dict[str, Any]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)
    manifest_b2_key: Optional[str] = None
    raw: Any = None
    storyboard_scenes: list[dict[str, Any]] = field(default_factory=list)


ProgressCallback = Callable[[list[dict[str, Any]]], None]


def _logo_external_inputs(
    logo_b2_key: str | None,
    b2: B2Service,
    *,
    provider: Any | None = None,
) -> list[Any] | None:
    if not logo_b2_key:
        return None
    if provider is not None and not provider_accepts_logo_reference(provider):
        logger.info(
            "Skipping logo external_inputs — provider %s does not accept input assets",
            getattr(provider, "name", provider),
        )
        return None
    return logo_external_inputs(logo_b2_key, b2)


def _embed_manifest_in_final_mp4(
    *,
    run: Any,
    manifest: Any,
    assets: list[dict[str, Any]],
    b2: B2Service,
) -> tuple[list[dict[str, Any]], Any]:
    """Best-effort embed of Genblaze manifest into the final MP4 on B2."""
    if manifest is None or run is None:
        return assets, manifest
    final = next((a for a in assets if a.get("kind") == "final"), None)
    if not final or not final.get("b2_key"):
        return assets, manifest
    try:
        from genblaze_core import Manifest
        from genblaze_core.media import Mp4Handler
    except ImportError:
        logger.warning("Mp4Handler unavailable; skipping manifest embed")
        return assets, manifest

    key = str(final["b2_key"])
    try:
        with tempfile.TemporaryDirectory(prefix="advault-embed-") as tmpdir:
            src = Path(tmpdir) / "final.mp4"
            src.write_bytes(b2.get_bytes(key))
            out_path = Mp4Handler().embed(src, manifest)
            payload = out_path.read_bytes()
            new_sha = b2.sha256_bytes(payload)
            b2.put_bytes(key, payload, content_type="video/mp4")
            final["sha256"] = new_sha
            for step in getattr(run, "steps", []) or []:
                for asset in getattr(step, "assets", []) or []:
                    mt = (getattr(asset, "media_type", "") or "").lower()
                    if not mt.startswith("video/"):
                        continue
                    asset_key = b2.key_from_url(getattr(asset, "url", None))
                    if asset_key == key:
                        asset.sha256 = new_sha
            manifest = Manifest.from_run(run)
            logger.info("Embedded manifest into final MP4 at %s", key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("manifest embed failed (continuing without): %s", exc)
    return assets, manifest


def _pipeline_manifest_fields(
    *,
    manifest: Any,
    settings: Settings,
    b2: B2Service,
    campaign_id: str,
    run_id: str,
) -> tuple[Optional[str], bool, Optional[str], dict[str, Any]]:
    """Verify manifest and persist B2 sidecar."""
    verified = False
    canonical = None
    if manifest is not None:
        canonical = getattr(manifest, "canonical_hash", None)
        try:
            verified = bool(manifest.verify())
        except Exception as exc:  # noqa: BLE001
            logger.warning("manifest.verify failed: %s", exc)
            verified = False

    manifest_key = None
    if settings.b2_configured and manifest is not None:
        manifest_key = _persist_manifest_sidecar(
            manifest=manifest,
            settings=settings,
            b2=b2,
            campaign_id=campaign_id,
            run_id=run_id,
        )
    return canonical, verified, manifest_key, _manifest_to_dict(manifest)


def build_prompts(
    *,
    product_name: str,
    product_description: str,
    audience: str,
    tone: str,
    cta: str,
    prompt_override: str | None = None,
    voiceover_script: str | None = None,
    music_prompt: str | None = None,
    has_logo: bool = False,
) -> dict[str, str]:
    base = prompt_override or (
        f"Professional advertising hero image for {product_name}. "
        f"{product_description}. Target audience: {audience or 'general consumers'}. "
        f"Tone: {tone}. Clean composition, product-focused, commercial photography, "
        f"no text overlays."
    )
    if has_logo:
        base += (
            " Respect the supplied brand logo reference; place it naturally "
            "without altering its design."
        )
    motion = (
        f"Subtle cinematic camera move over the product scene for {product_name}, "
        f"smooth, premium ad style, keep branding intact."
    )
    voice = voiceover_script or (
        f"Meet {product_name}. {product_description[:180]} "
        f"{cta}."
    )
    music = music_prompt or (
        f"Upbeat premium brand bed for a {tone} product commercial, "
        f"no vocals, modern marketing bed."
    )
    return {
        "image": base,
        "video": motion,
        "voice": voice,
        "music": music,
    }


def _extract_result_parts(raw: Any) -> tuple[Any, Any]:
    """Normalize Genblaze run() return shapes: result | (run, manifest)."""
    if isinstance(raw, tuple) and len(raw) >= 2:
        return raw[0], raw[1]
    run = getattr(raw, "run", raw)
    manifest = getattr(raw, "manifest", None)
    return run, manifest


def _step_summary(step: Any) -> dict[str, Any]:
    provider = getattr(step, "provider", None) or getattr(step, "provider_name", "") or ""
    model = getattr(step, "model", None) or ""
    status = getattr(step, "status", None) or "succeeded"
    name = (
        getattr(step, "name", None)
        or getattr(step, "step_type", None)
        or getattr(step, "modality", None)
        or "step"
    )
    fallback_used = bool(getattr(step, "fallback_used", False))
    return {
        "name": str(name),
        "status": str(status),
        "provider": str(provider),
        "model": str(model),
        "fallback_used": fallback_used,
    }


def _asset_kind_from_media(media_type: str, index: int, total: int) -> str:
    mt = (media_type or "").lower()
    if mt.startswith("image/"):
        return "image"
    if mt.startswith("video/"):
        return "final" if index == total - 1 else "video"
    if mt.startswith("audio/"):
        return "audio"
    return "other"


def _collect_assets(run: Any, b2: B2Service) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    steps = getattr(run, "steps", []) or []
    flat: list[tuple[Any, Any]] = []
    for step in steps:
        for asset in getattr(step, "assets", []) or []:
            flat.append((step, asset))

    total = len(flat)
    for idx, (step, asset) in enumerate(flat):
        url = getattr(asset, "url", None)
        media_type = getattr(asset, "media_type", "") or "application/octet-stream"
        kind = _asset_kind_from_media(media_type, idx, total)
        summary = _step_summary(step)
        key = b2.key_from_url(url) if url else None
        duration = getattr(asset, "duration", None)
        duration_ms = int(float(duration) * 1000) if duration else None
        assets.append(
            {
                "kind": kind,
                "step_name": summary["name"],
                "provider": summary["provider"],
                "model": summary["model"],
                "url": url,
                "b2_key": key,
                "sha256": getattr(asset, "sha256", None),
                "mime": media_type,
                "width": getattr(asset, "width", None),
                "height": getattr(asset, "height", None),
                "duration_ms": duration_ms,
            }
        )
    return assets


def _manifest_to_dict(manifest: Any) -> dict[str, Any]:
    if manifest is None:
        return {}
    if hasattr(manifest, "model_dump"):
        return manifest.model_dump()
    if hasattr(manifest, "dict"):
        return manifest.dict()
    if isinstance(manifest, dict):
        return manifest
    # Best-effort JSON roundtrip via public attributes.
    data: dict[str, Any] = {}
    for attr in ("canonical_hash", "run_id", "parent_run_id", "steps", "assets"):
        if hasattr(manifest, attr):
            data[attr] = getattr(manifest, attr)
    return data


def _persist_manifest_sidecar(
    *,
    manifest: Any,
    settings: Settings,
    b2: B2Service,
    campaign_id: str,
    run_id: str,
) -> Optional[str]:
    import json

    payload = _manifest_to_dict(manifest)
    if not payload:
        return None
    key = (
        f"{settings.b2_prefix}/campaigns/{campaign_id}/runs/{run_id}/manifest.json"
    )
    body = json.dumps(payload, default=str, indent=2).encode("utf-8")
    b2.put_bytes(key, body, content_type="application/json")
    b2.apply_object_lock(key)
    return key


def _step_failed(step: Any) -> bool:
    status = getattr(step, "status", None)
    raw = getattr(status, "value", status)
    text = str(raw or "").lower()
    if text in {"failed", "error", "cancelled"}:
        return True
    err = getattr(step, "error", None)
    return bool(err)


def _assert_pipeline_ok(
    run: Any,
    assets: list[dict[str, Any]],
    *,
    mode: str,
    critical_step_names: tuple[str, ...] | None = None,
) -> None:
    """Raise when Genblaze finished without usable media (timeout / step fail)."""
    steps = getattr(run, "steps", []) or []
    failures = []
    for step in steps:
        if not _step_failed(step):
            continue
        summary = _step_summary(step)
        name = summary["name"].lower()
        if critical_step_names is not None:
            if not any(c in name for c in critical_step_names):
                continue  # e.g. optional music
        err = getattr(step, "error", None) or summary.get("status")
        failures.append(f"{summary['name']}: {err}")
    if failures:
        raise RuntimeError(f"{mode} pipeline step failed — " + "; ".join(failures))
    if not assets:
        raise RuntimeError(
            f"{mode} pipeline produced no assets. Provider likely timed out or "
            f"failed silently. Retry NVIDIA, or set IMAGE_VENDOR=decart for "
            f"an alternate image path."
        )


def run_quick_pipeline(
    *,
    campaign_id: str,
    run_id: str,
    prompts: dict[str, str],
    settings: Settings | None = None,
    selection: dict[str, Any] | None = None,
    logo_b2_key: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> PipelineResult:
    from genblaze_core import Modality, Pipeline

    settings = settings or get_settings()
    Path(settings.output_dir).mkdir(parents=True, exist_ok=True)
    selection = selection or {}
    image_sel = selection.get("image") or {}

    image_provider, image_model, image_vendor = provider_factory.get_image_provider(
        settings,
        vendor=image_sel.get("vendor"),
        model=image_sel.get("model"),
    )
    steps_state = [
        {
            "name": "image",
            "status": "running",
            "provider": image_vendor,
            "model": image_model,
            "fallback_used": False,
        }
    ]
    if on_progress:
        on_progress(steps_state)

    sink = None
    if settings.b2_configured:
        sink = build_object_storage_sink(settings)

    b2 = B2Service(settings)
    logo_inputs = _logo_external_inputs(logo_b2_key, b2, provider=image_provider)
    image_kwargs: dict[str, Any] = {
        "model": image_model,
        "prompt": prompts["image"],
        "modality": Modality.IMAGE,
    }
    if logo_inputs:
        image_kwargs["external_inputs"] = logo_inputs

    pipe = Pipeline(f"advault-quick-{run_id}").step(
        image_provider,
        **image_kwargs,
    )

    # raise_on_failure so timeouts don't look like empty successes
    run_kwargs: dict[str, Any] = {"raise_on_failure": True}
    if sink is not None:
        run_kwargs["sink"] = sink
    try:
        raw = pipe.run(**run_kwargs)
    except TypeError:
        # Older genblaze without raise_on_failure kwarg
        raw = pipe.run(sink=sink) if sink is not None else pipe.run()

    run, manifest = _extract_result_parts(raw)

    assets = _collect_assets(run, b2) if run is not None else []

    if run is not None and getattr(run, "steps", None):
        summary = _step_summary(run.steps[0])
        steps_state[0].update(
            {
                "provider": summary["provider"] or image_vendor,
                "model": summary["model"] or image_model,
                "fallback_used": summary["fallback_used"],
                "status": "failed" if _step_failed(run.steps[0]) else "succeeded",
            }
        )
    else:
        steps_state[0]["status"] = "succeeded" if assets else "failed"

    if on_progress:
        on_progress(steps_state)

    _assert_pipeline_ok(run, assets, mode="quick")

    canonical, verified, manifest_key, manifest_dict = _pipeline_manifest_fields(
        manifest=manifest,
        settings=settings,
        b2=b2,
        campaign_id=campaign_id,
        run_id=run_id,
    )

    return PipelineResult(
        mode="quick",
        genblaze_run_id=str(getattr(run, "run_id", None) or run_id),
        canonical_hash=canonical,
        manifest_verified=verified,
        manifest_dict=manifest_dict,
        assets=assets,
        steps=steps_state,
        manifest_b2_key=manifest_key,
        raw=raw,
    )


def run_full_pipeline(
    *,
    campaign_id: str,
    run_id: str,
    prompts: dict[str, str],
    settings: Settings | None = None,
    selection: dict[str, Any] | None = None,
    include_music: bool = False,
    logo_b2_key: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> PipelineResult:
    """Full ad pack: image → video → voice → optional music → ffmpeg mux.

    Follows the official sample: video vendors receive prior image via chain
    input / external_inputs semantics; GMI is no longer required.
    Music is off by default (Replicate/GMI usually need credits).
    """
    from genblaze_core import Modality, Pipeline

    settings = settings or get_settings()
    Path(settings.output_dir).mkdir(parents=True, exist_ok=True)
    selection = selection or {}
    image_sel = selection.get("image") or {}
    video_sel = selection.get("video") or {}
    tts_sel = selection.get("tts") or {}
    music_sel = selection.get("music") or {}

    image_provider, image_model, image_vendor = provider_factory.get_image_provider(
        settings,
        vendor=image_sel.get("vendor"),
        model=image_sel.get("model"),
    )
    video_provider, video_model, fallbacks, video_vendor, _handoff = (
        provider_factory.get_video_provider(
            settings,
            vendor=video_sel.get("vendor"),
            model=video_sel.get("model"),
        )
    )
    voice_provider, voice_model, voice_vendor = provider_factory.get_voice_provider(
        settings,
        vendor=tts_sel.get("vendor"),
        model=tts_sel.get("model"),
    )
    compositor = provider_factory.get_compositor(settings)

    steps_state = [
        {
            "name": "image",
            "status": "queued",
            "provider": image_vendor,
            "model": image_model,
            "fallback_used": False,
        },
        {
            "name": "video",
            "status": "queued",
            "provider": video_vendor,
            "model": video_model,
            "fallback_used": False,
        },
        {
            "name": "voiceover",
            "status": "queued",
            "provider": voice_vendor,
            "model": voice_model,
            "fallback_used": False,
        },
        {
            "name": "compose",
            "status": "queued",
            "provider": "ffmpeg",
            "model": "ffmpeg-compositor",
            "fallback_used": False,
        },
    ]

    music_provider = music_model = music_vendor = None
    if include_music:
        try:
            music_provider, music_model, music_vendor = provider_factory.get_music_provider(
                settings,
                vendor=music_sel.get("vendor"),
                model=music_sel.get("model"),
            )
            steps_state.insert(
                3,
                {
                    "name": "music",
                    "status": "queued",
                    "provider": music_vendor,
                    "model": music_model,
                    "fallback_used": False,
                },
            )
        except RuntimeError:
            include_music = False

    def mark(name: str, status: str) -> None:
        for item in steps_state:
            if item["name"] == name:
                item["status"] = status
        if on_progress:
            on_progress(steps_state)

    # Emit queued skeleton immediately so pollers see the full pipeline shape.
    if on_progress:
        on_progress(steps_state)

    sink = None
    if settings.b2_configured:
        sink = build_object_storage_sink(settings)

    b2 = B2Service(settings)
    logo_inputs = _logo_external_inputs(logo_b2_key, b2, provider=image_provider)
    image_step_kwargs: dict[str, Any] = {
        "model": image_model,
        "prompt": prompts["image"],
        "modality": Modality.IMAGE,
    }
    if logo_inputs:
        image_step_kwargs["external_inputs"] = logo_inputs

    # chain=True: image assets flow into the video step (sample external_inputs pattern).
    video_kwargs: dict[str, Any] = {
        "model": video_model,
        "prompt": prompts["video"],
        "modality": Modality.VIDEO,
    }
    if fallbacks:
        video_kwargs["fallback_models"] = fallbacks

    pipe = (
        # Match official sample: video/tts best-effort — don't abort whole run
        # at preflight when a cloud slug probes DEAD.
        Pipeline(f"advault-full-{run_id}", chain=True, preflight=False)
        .step(
            image_provider,
            **image_step_kwargs,
        )
        .step(video_provider, **video_kwargs)
        .step(
            voice_provider,
            model=voice_model,
            prompt=prompts["voice"],
            modality=Modality.AUDIO,
        )
    )

    compose_from = [1, 2]  # video + voiceover (0=image)
    if include_music and music_provider is not None:
        pipe = pipe.step(
            music_provider,
            model=music_model,
            prompt=prompts["music"],
            modality=Modality.AUDIO,
        )
        compose_from = [1, 2, 3]  # video + VO (+ music if present)

    # Explicit input_from — chain=True alone only passes the *previous* step
    # (audio), so the compositor would never see the Ken Burns video.
    pipe = pipe.step(
        compositor,
        model="ffmpeg-mux",
        prompt="mux video + voiceover",
        modality=Modality.VIDEO,
        input_from=compose_from,
    )

    mark("image", "running")
    # fail_fast=False keeps optional music from blocking; we still require assets.
    run_kwargs: dict[str, Any] = {"timeout": 900, "fail_fast": False}
    if sink is not None:
        run_kwargs["sink"] = sink
    try:
        run_kwargs["raise_on_failure"] = False
        raw = pipe.run(**run_kwargs)
    except TypeError:
        run_kwargs.pop("raise_on_failure", None)
        raw = pipe.run(**run_kwargs)
    run, manifest = _extract_result_parts(raw)

    if run is not None:
        for idx, step in enumerate(getattr(run, "steps", []) or []):
            summary = _step_summary(step)
            if idx < len(steps_state):
                failed = _step_failed(step)
                steps_state[idx].update(
                    {
                        "provider": summary["provider"] or steps_state[idx]["provider"],
                        "model": summary["model"] or steps_state[idx]["model"],
                        "fallback_used": summary["fallback_used"],
                        "status": "failed" if failed else "succeeded",
                    }
                )
        for item in steps_state:
            if item["status"] not in {"failed", "succeeded"}:
                item["status"] = "succeeded"
    if on_progress:
        on_progress(steps_state)

    assets = _collect_assets(run, b2) if run is not None else []
    assets, manifest = _embed_manifest_in_final_mp4(
        run=run,
        manifest=manifest,
        assets=assets,
        b2=b2,
    )
    # Require a successful compose/mux when that step exists
    _assert_pipeline_ok(
        run,
        assets,
        mode="full",
        critical_step_names=("image", "video", "compose", "ffmpeg", "mix"),
    )

    canonical, verified, manifest_key, manifest_dict = _pipeline_manifest_fields(
        manifest=manifest,
        settings=settings,
        b2=b2,
        campaign_id=campaign_id,
        run_id=run_id,
    )

    return PipelineResult(
        mode="full",
        genblaze_run_id=str(getattr(run, "run_id", None) or run_id),
        canonical_hash=canonical,
        manifest_verified=verified,
        manifest_dict=manifest_dict,
        assets=assets,
        steps=steps_state,
        manifest_b2_key=manifest_key,
        raw=raw,
    )


def _provider_step_name(provider: Any) -> str:
    return str(getattr(provider, "name", "") or "provider")


def _generate_storyboard_scene_image(
    *,
    scene_index: int,
    prompt: str,
    run_id: str,
    settings: Settings,
    selection: dict[str, Any],
    logo_b2_key: str | None,
    b2: B2Service,
    sink: Any | None,
    preferred_vendor: str,
    preferred_model: str,
) -> tuple[dict[str, Any], Any, str, str, bool]:
    """Generate one storyboard still; fall back across image vendors on failure."""
    from genblaze_core import Modality, Pipeline

    from app.core.catalog import image_vendor_fallback_order

    image_sel = selection.get("image") or {}
    vendors = image_vendor_fallback_order(preferred_vendor, settings)
    last_err: Exception | None = None

    for vendor_idx, vendor in enumerate(vendors):
        model_override = preferred_model if vendor == preferred_vendor else None
        if vendor == (image_sel.get("vendor") or "").lower():
            model_override = model_override or image_sel.get("model")
        try:
            provider, model_id, vendor_id = provider_factory.get_image_provider(
                settings,
                vendor=vendor,
                model=model_override,
            )
        except RuntimeError as exc:
            last_err = exc
            continue

        logo_inputs = _logo_external_inputs(logo_b2_key, b2, provider=provider)
        step_kwargs: dict[str, Any] = {
            "model": model_id,
            "prompt": prompt,
            "modality": Modality.IMAGE,
        }
        if logo_inputs:
            step_kwargs["external_inputs"] = logo_inputs

        pipe = Pipeline(
            f"advault-sb-{run_id}-scene-{scene_index}",
            preflight=False,
        ).step(provider, **step_kwargs)
        run_kwargs: dict[str, Any] = {
            "timeout": 600,
            "fail_fast": False,
            "raise_on_failure": False,
        }
        if sink is not None:
            run_kwargs["sink"] = sink
        try:
            raw = pipe.run(**run_kwargs)
        except TypeError:
            run_kwargs.pop("raise_on_failure", None)
            try:
                raw = pipe.run(**run_kwargs)
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                logger.warning(
                    "Storyboard scene %s vendor %s failed: %s",
                    scene_index + 1,
                    vendor,
                    exc,
                )
                continue
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning(
                "Storyboard scene %s vendor %s failed: %s",
                scene_index + 1,
                vendor,
                exc,
            )
            continue

        run_part, _ = _extract_result_parts(raw)
        steps = getattr(run_part, "steps", None) or []
        if not steps:
            last_err = RuntimeError("empty pipeline run")
            continue
        step = steps[0]
        if _step_failed(step) or not getattr(step, "assets", None):
            err = getattr(step, "error", None) or "step produced no assets"
            last_err = RuntimeError(str(err))
            logger.warning(
                "Storyboard scene %s vendor %s step failed: %s",
                scene_index + 1,
                vendor,
                err,
            )
            continue

        assets = _collect_assets(run_part, b2)
        if not assets:
            last_err = RuntimeError("no assets collected")
            continue

        asset_dict = assets[0]
        asset_dict["step_name"] = f"scene-{scene_index + 1}"
        asset_dict["provider"] = vendor_id
        asset_dict["model"] = model_id
        fallback_used = vendor_idx > 0
        if fallback_used:
            logger.info(
                "Storyboard scene %s succeeded via fallback vendor %s",
                scene_index + 1,
                vendor_id,
            )
        return asset_dict, step, vendor_id, model_id, fallback_used

    raise RuntimeError(
        f"Scene {scene_index + 1} image failed for all vendors "
        f"({', '.join(vendors)}). Last error: {last_err}"
    )


def run_storyboard_phase(
    *,
    campaign_id: str,
    run_id: str,
    campaign_context: dict[str, str],
    prompts: dict[str, str],
    storyboard_meta: dict[str, Any],
    settings: Settings | None = None,
    selection: dict[str, Any] | None = None,
    logo_b2_key: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> PipelineResult:
    """Plan scene prompts and generate one image per scene (per-scene fallback)."""
    from genblaze_core import Manifest
    from genblaze_core.models.run import Run as GBRun

    from app.core.storyboard import plan_scenes

    settings = settings or get_settings()
    selection = selection or {}
    image_sel = selection.get("image") or {}

    image_provider, image_model, image_vendor = provider_factory.get_image_provider(
        settings,
        vendor=image_sel.get("vendor"),
        model=image_sel.get("model"),
    )
    b2 = B2Service(settings)

    scene_count = storyboard_meta.get("scene_count")
    scenes = plan_scenes(
        product_name=campaign_context["product_name"],
        product_description=campaign_context["product_description"],
        audience=campaign_context["audience"],
        tone=campaign_context["tone"],
        cta=campaign_context.get("cta", "Shop now"),
        voiceover=prompts.get("voice", ""),
        scene_count=scene_count,
    )
    generated_voice = " ".join(
        str(s.get("voice_line") or "").strip() for s in scenes if s.get("voice_line")
    )
    if generated_voice:
        prompts["voice"] = generated_voice

    steps_state: list[dict[str, Any]] = [
        {
            "name": "storyboard-plan",
            "status": "succeeded",
            "provider": "advault",
            "model": "scene-planner",
            "fallback_used": False,
        }
    ]
    for scene in scenes:
        steps_state.append(
            {
                "name": f"scene-{scene['index'] + 1}",
                "status": "queued",
                "provider": image_vendor,
                "model": image_model,
                "fallback_used": False,
            }
        )
    if on_progress:
        on_progress(steps_state)

    sink = None
    if settings.b2_configured:
        sink = build_object_storage_sink(settings)

    gb_steps: list[Any] = []
    image_assets: list[dict[str, Any]] = []

    for scene in scenes:
        step_row = steps_state[scene["index"] + 1]
        step_row["status"] = "running"
        if on_progress:
            on_progress(steps_state)
        asset_dict, gb_step, used_vendor, used_model, fallback_used = (
            _generate_storyboard_scene_image(
                scene_index=scene["index"],
                prompt=scene["prompt"],
                run_id=run_id,
                settings=settings,
                selection=selection,
                logo_b2_key=logo_b2_key,
                b2=b2,
                sink=sink,
                preferred_vendor=image_vendor,
                preferred_model=image_model,
            )
        )
        gb_steps.append(gb_step)
        image_assets.append(asset_dict)
        scene["asset_id"] = None
        scene["status"] = "ready"
        step_row.update(
            {
                "status": "succeeded",
                "provider": used_vendor,
                "model": used_model,
                "fallback_used": fallback_used,
            }
        )
        if on_progress:
            on_progress(steps_state)

    gb_run = GBRun(
        run_id=run_id,
        name=f"advault-storyboard-scenes-{run_id}",
        steps=gb_steps,
    )
    manifest = Manifest.from_run(gb_run)

    _assert_pipeline_ok(gb_run, image_assets, mode="storyboard-scenes")

    canonical, verified, manifest_key, manifest_dict = _pipeline_manifest_fields(
        manifest=manifest,
        settings=settings,
        b2=b2,
        campaign_id=campaign_id,
        run_id=run_id,
    )

    return PipelineResult(
        mode="storyboard-scenes",
        genblaze_run_id=run_id,
        canonical_hash=canonical,
        manifest_verified=verified,
        manifest_dict=manifest_dict,
        assets=image_assets,
        steps=steps_state,
        manifest_b2_key=manifest_key,
        raw=gb_run,
        storyboard_scenes=scenes,
    )


def run_storyboard_finalize_pipeline(
    *,
    campaign_id: str,
    run_id: str,
    prompts: dict[str, str],
    scene_image_urls: list[str],
    scene_durations: list[float],
    settings: Settings | None = None,
    selection: dict[str, Any] | None = None,
    include_music: bool = False,
    on_progress: ProgressCallback | None = None,
) -> PipelineResult:
    """After storyboard approval: multi-scene video → VO → optional music → mux.

    Uses Genblaze ``Pipeline.run()`` + B2 sink so finalize runs get the same
    manifest / canonical_hash provenance as Quick and Full modes.
    """
    from genblaze_core import Modality, Pipeline
    from genblaze_core.models.asset import Asset as GBAsset

    from app.core.local_video import LocalMultiSceneVideoProvider

    settings = settings or get_settings()
    Path(settings.output_dir).mkdir(parents=True, exist_ok=True)
    selection = selection or {}
    tts_sel = selection.get("tts") or {}
    music_sel = selection.get("music") or {}

    voice_provider, voice_model, voice_vendor = provider_factory.get_voice_provider(
        settings,
        vendor=tts_sel.get("vendor"),
        model=tts_sel.get("model"),
    )
    compositor = provider_factory.get_compositor(settings)
    multi_video = LocalMultiSceneVideoProvider(
        ffmpeg_path=settings.ffmpeg_path,
        output_dir=settings.output_dir,
    )
    scene_inputs = [
        GBAsset(url=url, media_type="image/png") for url in scene_image_urls
    ]

    steps_state: list[dict[str, Any]] = [
        {
            "name": "video",
            "status": "queued",
            "provider": "local",
            "model": "multiscene",
            "fallback_used": False,
        },
        {
            "name": "voiceover",
            "status": "queued",
            "provider": voice_vendor,
            "model": voice_model,
            "fallback_used": False,
        },
        {
            "name": "compose",
            "status": "queued",
            "provider": "ffmpeg",
            "model": "ffmpeg-compositor",
            "fallback_used": False,
        },
    ]

    music_provider = music_model = music_vendor = None
    if include_music:
        try:
            music_provider, music_model, music_vendor = provider_factory.get_music_provider(
                settings,
                vendor=music_sel.get("vendor"),
                model=music_sel.get("model"),
            )
            steps_state.insert(
                2,
                {
                    "name": "music",
                    "status": "queued",
                    "provider": music_vendor,
                    "model": music_model,
                    "fallback_used": False,
                },
            )
        except RuntimeError:
            include_music = False

    def mark(name: str, status: str) -> None:
        for item in steps_state:
            if item["name"] == name:
                item["status"] = status
        if on_progress:
            on_progress(steps_state)

    if on_progress:
        on_progress(steps_state)

    sink = None
    if settings.b2_configured:
        sink = build_object_storage_sink(settings)

    pipe = (
        Pipeline(f"advault-storyboard-{run_id}", chain=False, preflight=False)
        .step(
            multi_video,
            model="multiscene",
            prompt=prompts.get("video", "storyboard scenes"),
            modality=Modality.VIDEO,
            external_inputs=scene_inputs,
            durations=scene_durations,
        )
        .step(
            voice_provider,
            model=voice_model,
            prompt=prompts.get("voice", ""),
            modality=Modality.AUDIO,
        )
    )

    compose_from = [0, 1]
    if include_music and music_provider is not None:
        pipe = pipe.step(
            music_provider,
            model=music_model,
            prompt=prompts.get("music", ""),
            modality=Modality.AUDIO,
        )
        compose_from = [0, 1, 2]

    pipe = pipe.step(
        compositor,
        model="ffmpeg-mux",
        prompt="mux storyboard video + voiceover",
        modality=Modality.VIDEO,
        input_from=compose_from,
    )

    mark("video", "running")
    run_kwargs: dict[str, Any] = {"timeout": 900, "fail_fast": False}
    if sink is not None:
        run_kwargs["sink"] = sink
    try:
        run_kwargs["raise_on_failure"] = False
        raw = pipe.run(**run_kwargs)
    except TypeError:
        run_kwargs.pop("raise_on_failure", None)
        raw = pipe.run(**run_kwargs)
    run, manifest = _extract_result_parts(raw)

    if run is not None:
        for idx, step in enumerate(getattr(run, "steps", []) or []):
            summary = _step_summary(step)
            if idx < len(steps_state):
                failed = _step_failed(step)
                steps_state[idx].update(
                    {
                        "provider": summary["provider"] or steps_state[idx]["provider"],
                        "model": summary["model"] or steps_state[idx]["model"],
                        "fallback_used": summary["fallback_used"],
                        "status": "failed" if failed else "succeeded",
                    }
                )
        for item in steps_state:
            if item["status"] not in {"failed", "succeeded"}:
                item["status"] = "succeeded"
    if on_progress:
        on_progress(steps_state)

    b2 = B2Service(settings)
    assets = _collect_assets(run, b2) if run is not None else []
    assets, manifest = _embed_manifest_in_final_mp4(
        run=run,
        manifest=manifest,
        assets=assets,
        b2=b2,
    )
    _assert_pipeline_ok(
        run,
        assets,
        mode="storyboard-finalize",
        critical_step_names=("video", "compose", "ffmpeg", "multiscene"),
    )

    canonical, verified, manifest_key, manifest_dict = _pipeline_manifest_fields(
        manifest=manifest,
        settings=settings,
        b2=b2,
        campaign_id=campaign_id,
        run_id=run_id,
    )

    return PipelineResult(
        mode="storyboard-finalize",
        genblaze_run_id=str(getattr(run, "run_id", None) or run_id),
        canonical_hash=canonical,
        manifest_verified=verified,
        manifest_dict=manifest_dict,
        assets=assets,
        steps=steps_state,
        manifest_b2_key=manifest_key,
        raw=raw,
    )
