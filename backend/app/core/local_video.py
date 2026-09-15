"""Local still → short MP4 via FFmpeg (Ken Burns / padded hold).

Decart retired ``lucy-*-i2v`` from the Python SDK; NVIDIA Cosmos probes DEAD
on free NIM. This keeps Full Ad offline-capable for the video step.
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
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

DEFAULT_MODEL = "kenburns"
_DURATION_SEC = 5


def _upload_mp4_to_b2(payload: bytes, step_id: str) -> tuple[str, str]:
    from app.config import get_settings
    from app.core.storage import B2Service

    settings = get_settings()
    sha = hashlib.sha256(payload).hexdigest()
    key = f"{settings.b2_prefix}/inbox/{step_id or uuid.uuid4().hex}.mp4"
    b2 = B2Service(settings)
    b2.put_bytes(key, payload, content_type="video/mp4")
    return b2.presign_get(key), sha


def _file_url_to_path(url: str) -> Path:
    parsed = urlparse(url)
    path = unquote(parsed.path)
    if len(path) >= 3 and path[0] == "/" and path[2] == ":":
        path = path[1:]
    return Path(path)


def _download_image(url: str, dest: Path) -> Path:
    if url.startswith("file:"):
        src = _file_url_to_path(url)
        if not src.is_file():
            raise FileNotFoundError(f"Missing local image: {src}")
        dest.write_bytes(src.read_bytes())
        return dest

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        resp = client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


def _kenburns_mp4(
    image_path: Path,
    out_path: Path,
    *,
    ffmpeg: str,
    duration: float = _DURATION_SEC,
    width: int = 1280,
    height: int = 720,
) -> None:
    fps = 25
    frames = max(int(duration * fps), fps)
    # Subtle zoom; letterbox to the target placement size so the mux stays consistent.
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
        f"zoompan=z='min(1.0+0.0009*on,1.12)':d={frames}:"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps=25"
    )
    cmd = [
        ffmpeg,
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-vf",
        vf,
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-an",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-800:] if proc.stderr else "ffmpeg failed")


class LocalStillVideoProvider(SyncProvider):
    """Chain image → short H.264 clip (no cloud video credits)."""

    name = "local-still-video"
    discovery_support = DiscoverySupport.NONE

    @classmethod
    def create_registry(cls) -> ModelRegistry:
        family = ModelFamily(
            name="local-ffmpeg-still",
            pattern=re.compile(r"^(kenburns|still|local-video)$"),
            spec_template=ModelSpec(model_id="*", modality=Modality.VIDEO),
            description="FFmpeg Ken Burns / still hold from prior image asset.",
            example_slugs=(DEFAULT_MODEL, "still"),
        )
        return ModelRegistry(
            provider_families=(family,),
            fallback=ModelSpec(model_id="*", modality=Modality.VIDEO),
        )

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.VIDEO],
            supported_inputs=["image", "text"],
            accepts_chain_input=True,
            output_formats=["video/mp4"],
            models=[DEFAULT_MODEL, "still"],
        )

    def __init__(
        self,
        ffmpeg_path: str = "ffmpeg",
        output_dir: str | Path | None = None,
        *,
        width: int = 1280,
        height: int = 720,
    ):
        super().__init__()
        self._ffmpeg = ffmpeg_path or "ffmpeg"
        self._output_dir = Path(output_dir) if output_dir else None
        self._width = width
        self._height = height

    def generate(self, step: Step, config: RunnableConfig | None = None) -> Step:
        ffmpeg = self._ffmpeg
        if not shutil.which(ffmpeg) and not Path(ffmpeg).is_file():
            raise ProviderError(
                f"ffmpeg not found at {ffmpeg!r}. Install ffmpeg and set FFMPEG_PATH.",
                error_code=ProviderErrorCode.CONFIG_ERROR,
            )

        image_url = None
        for asset in getattr(step, "inputs", None) or []:
            mt = (getattr(asset, "media_type", "") or "").lower()
            url = getattr(asset, "url", None)
            is_image = mt.startswith("image/") or str(url).lower().endswith(
                (".png", ".jpg", ".jpeg", ".webp")
            )
            if url and is_image:
                image_url = url
                break
        if not image_url and step.inputs:
            image_url = getattr(step.inputs[0], "url", None)
        if not image_url:
            raise ProviderError(
                "Local still-video needs a prior image on the chain.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        work = Path(tempfile.mkdtemp(prefix="advault-still-"))
        try:
            img_path = work / "still.png"
            out_path = work / "clip.mp4"
            try:
                _download_image(image_url, img_path)
            except Exception as exc:
                raise ProviderError(
                    f"Failed to read chain image: {exc}",
                    error_code=ProviderErrorCode.INVALID_INPUT,
                ) from exc

            model = (step.model or DEFAULT_MODEL).lower()
            duration = _DURATION_SEC
            try:
                if model == "still":
                    # Flat hold — no zoom (faster / safer)
                    cmd = [
                        ffmpeg,
                        "-y",
                        "-loop",
                        "1",
                        "-i",
                        str(img_path),
                        "-vf",
                        f"scale={self._width}:{self._height}:force_original_aspect_ratio=decrease,"
                        f"pad={self._width}:{self._height}:(ow-iw)/2:(oh-ih)/2",
                        "-t",
                        str(duration),
                        "-c:v",
                        "libx264",
                        "-pix_fmt",
                        "yuv420p",
                        "-an",
                        str(out_path),
                    ]
                    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
                    if proc.returncode != 0:
                        raise RuntimeError(proc.stderr[-800:] if proc.stderr else "ffmpeg failed")
                else:
                    _kenburns_mp4(
                        img_path,
                        out_path,
                        ffmpeg=ffmpeg,
                        duration=duration,
                        width=self._width,
                        height=self._height,
                    )
            except Exception as exc:
                raise ProviderError(
                    f"FFmpeg still→video failed: {exc}",
                    error_code=ProviderErrorCode.MODEL_ERROR,
                ) from exc

            payload = out_path.read_bytes()
            if self._output_dir:
                keep = Path(self._output_dir).resolve()
                keep.mkdir(parents=True, exist_ok=True)
                (keep / f"{step.step_id}.mp4").write_bytes(payload)

            try:
                url, sha = _upload_mp4_to_b2(payload, step.step_id)
                asset = Asset(url=url, media_type="video/mp4", sha256=sha)
            except Exception as upload_exc:
                logger.warning("B2 inbox upload failed for still-video (%s)", upload_exc)
                local = (
                    Path(self._output_dir or tempfile.gettempdir())
                    / "advault-still"
                    / f"{step.step_id}.mp4"
                )
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(payload)
                asset = Asset(url=local.resolve().as_uri(), media_type="video/mp4")

            step.assets.append(asset)
            return step
        finally:
            shutil.rmtree(work, ignore_errors=True)


def _concat_mp4(clip_paths: list[Path], out_path: Path, *, ffmpeg: str) -> None:
    if not clip_paths:
        raise RuntimeError("No clips to concatenate")
    if len(clip_paths) == 1:
        out_path.write_bytes(clip_paths[0].read_bytes())
        return

    work = out_path.parent
    list_file = work / "concat.txt"
    lines = []
    for clip in clip_paths:
        safe = str(clip.resolve()).replace("'", "'\\''")
        lines.append(f"file '{safe}'")
    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_file),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-an",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-800:] if proc.stderr else "ffmpeg concat failed")


class LocalMultiSceneVideoProvider(SyncProvider):
    """Multiple scene stills → one silent MP4 (Ken Burns per scene, then concat)."""

    name = "local-multi-scene-video"
    discovery_support = DiscoverySupport.NONE

    @classmethod
    def create_registry(cls) -> ModelRegistry:
        family = ModelFamily(
            name="local-ffmpeg-multiscene",
            pattern=re.compile(r"^(multiscene|multi-scene|storyboard)$"),
            spec_template=ModelSpec(model_id="*", modality=Modality.VIDEO),
            description="FFmpeg Ken Burns per scene image, concatenated in order.",
            example_slugs=("multiscene", "storyboard"),
        )
        return ModelRegistry(
            provider_families=(family,),
            fallback=ModelSpec(model_id="*", modality=Modality.VIDEO),
        )

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.VIDEO],
            supported_inputs=["image"],
            accepts_chain_input=True,
            output_formats=["video/mp4"],
            models=["multiscene", "storyboard", "kenburns"],
        )

    def __init__(
        self,
        ffmpeg_path: str = "ffmpeg",
        output_dir: str | Path | None = None,
        *,
        width: int = 1280,
        height: int = 720,
    ):
        super().__init__()
        self._ffmpeg = ffmpeg_path or "ffmpeg"
        self._output_dir = Path(output_dir) if output_dir else None
        self._width = width
        self._height = height

    def generate(self, step: Step, config: RunnableConfig | None = None) -> Step:
        ffmpeg = self._ffmpeg
        if not shutil.which(ffmpeg) and not Path(ffmpeg).is_file():
            raise ProviderError(
                f"ffmpeg not found at {ffmpeg!r}. Install ffmpeg and set FFMPEG_PATH.",
                error_code=ProviderErrorCode.CONFIG_ERROR,
            )

        image_urls: list[str] = []
        for asset in getattr(step, "inputs", None) or []:
            mt = (getattr(asset, "media_type", "") or "").lower()
            url = getattr(asset, "url", None)
            if url and (
                mt.startswith("image/")
                or str(url).lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
            ):
                image_urls.append(url)
        if not image_urls:
            raise ProviderError(
                "Multi-scene video needs one or more scene images in inputs.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        params = getattr(step, "params", None) or {}
        durations_raw = params.get("durations") or []
        durations: list[float] = []
        for idx in range(len(image_urls)):
            if idx < len(durations_raw):
                try:
                    durations.append(max(1.5, float(durations_raw[idx])))
                except (TypeError, ValueError):
                    durations.append(_DURATION_SEC)
            else:
                durations.append(_DURATION_SEC)

        work = Path(tempfile.mkdtemp(prefix="advault-multiscene-"))
        try:
            clip_paths: list[Path] = []
            for idx, url in enumerate(image_urls):
                img_path = work / f"scene-{idx}.png"
                clip_path = work / f"clip-{idx}.mp4"
                try:
                    _download_image(url, img_path)
                except Exception as exc:
                    raise ProviderError(
                        f"Failed to read scene image {idx + 1}: {exc}",
                        error_code=ProviderErrorCode.INVALID_INPUT,
                    ) from exc
                _kenburns_mp4(
                    img_path,
                    clip_path,
                    ffmpeg=ffmpeg,
                    duration=durations[idx],
                    width=self._width,
                    height=self._height,
                )
                clip_paths.append(clip_path)

            out_path = work / "storyboard.mp4"
            _concat_mp4(clip_paths, out_path, ffmpeg=ffmpeg)
            payload = out_path.read_bytes()

            if self._output_dir:
                keep = Path(self._output_dir).resolve()
                keep.mkdir(parents=True, exist_ok=True)
                (keep / f"{step.step_id}.mp4").write_bytes(payload)

            try:
                url, sha = _upload_mp4_to_b2(payload, step.step_id)
                asset = Asset(url=url, media_type="video/mp4", sha256=sha)
            except Exception as upload_exc:
                logger.warning("B2 inbox upload failed for multiscene (%s)", upload_exc)
                local = (
                    Path(self._output_dir or tempfile.gettempdir())
                    / "advault-multiscene"
                    / f"{step.step_id}.mp4"
                )
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(payload)
                asset = Asset(url=local.resolve().as_uri(), media_type="video/mp4")

            step.assets.append(asset)
            return step
        finally:
            shutil.rmtree(work, ignore_errors=True)
