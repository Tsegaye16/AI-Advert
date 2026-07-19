"""Mux prior video + audio into one MP4 (FFmpeg) and store on B2.

Video is looped/padded to cover the full voiceover so ``-shortest`` does not
truncate narration (Ken Burns clips are often shorter than TTS).
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


def _upload_mp4(payload: bytes, step_id: str) -> tuple[str, str]:
    from app.config import get_settings
    from app.core.storage import B2Service

    settings = get_settings()
    sha = hashlib.sha256(payload).hexdigest()
    key = f"{settings.b2_prefix}/inbox/{step_id or uuid.uuid4().hex}.mp4"
    b2 = B2Service(settings)
    b2.put_bytes(key, payload, content_type="video/mp4")
    return b2.presign_get(key), sha


def _materialize(url: str, dest: Path) -> Path:
    if url.startswith("file:"):
        parsed = urlparse(url)
        path = unquote(parsed.path or "")
        if not path and parsed.netloc:
            path = unquote(parsed.netloc + (parsed.path or ""))
        if len(path) >= 3 and path[0] == "/" and path[2] == ":":
            path = path[1:]
        src = Path(path)
        dest.write_bytes(src.read_bytes())
        return dest
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        resp = client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


def _ffprobe_bin(ffmpeg: str) -> str:
    p = Path(ffmpeg)
    if p.name.lower().startswith("ffmpeg"):
        candidate = p.with_name(p.name.lower().replace("ffmpeg", "ffprobe", 1))
        if candidate.is_file() or shutil.which(str(candidate)):
            return str(candidate)
    return shutil.which("ffprobe") or "ffprobe"


def _probe_duration_seconds(path: Path, ffmpeg: str) -> float:
    probe = _ffprobe_bin(ffmpeg)
    cmd = [
        probe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        return 0.0
    try:
        return max(0.0, float((proc.stdout or "").strip() or "0"))
    except ValueError:
        return 0.0


def _mux_aligned(ffmpeg: str, video: Path, audio: Path, out: Path) -> None:
    """Loop video until VO ends; audio is the master clock via -shortest."""
    audio_dur = _probe_duration_seconds(audio, ffmpeg)
    video_dur = _probe_duration_seconds(video, ffmpeg)
    logger.info(
        "Mux align: video=%.2fs audio=%.2fs (loop video to cover VO)",
        video_dur,
        audio_dur,
    )

    cmd = [
        ffmpeg,
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        str(video),
        "-i",
        str(audio),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out),
    ]
    # -shortest stops when the VO ends; stream_loop keeps picture under the narration.
    if audio_dur > 0.5:
        idx = cmd.index("-shortest")
        cmd[idx : idx + 1] = ["-t", f"{audio_dur:.3f}"]

    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "")[-900:])


class LocalMuxProvider(SyncProvider):
    """Combine video + audio inputs into a voiceover-length ad MP4."""

    name = "ffmpeg-compositor"
    discovery_support = DiscoverySupport.NONE

    @classmethod
    def create_registry(cls) -> ModelRegistry:
        family = ModelFamily(
            name="local-ffmpeg-mux",
            pattern=re.compile(r"^(ffmpeg-mux|mux|compose)$"),
            spec_template=ModelSpec(model_id="*", modality=Modality.VIDEO),
            description="FFmpeg mux of chained video + audio assets.",
            example_slugs=("ffmpeg-mux",),
        )
        return ModelRegistry(
            provider_families=(family,),
            fallback=ModelSpec(model_id="*", modality=Modality.VIDEO),
        )

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.VIDEO],
            supported_inputs=["video", "audio"],
            accepts_chain_input=True,
            output_formats=["video/mp4"],
            models=["ffmpeg-mux", "mux"],
        )

    def __init__(self, ffmpeg_path: str = "ffmpeg", output_dir: str | Path | None = None):
        super().__init__()
        self._ffmpeg = ffmpeg_path or "ffmpeg"
        self._output_dir = Path(output_dir) if output_dir else None

    def generate(self, step: Step, config: RunnableConfig | None = None) -> Step:
        if not shutil.which(self._ffmpeg) and not Path(self._ffmpeg).is_file():
            raise ProviderError(
                f"ffmpeg not found at {self._ffmpeg!r}",
                error_code=ProviderErrorCode.CONFIG_ERROR,
            )

        video = audio = None
        for asset in getattr(step, "inputs", None) or []:
            mt = (getattr(asset, "media_type", "") or "").lower()
            if video is None and mt.startswith("video/"):
                video = asset
            elif audio is None and mt.startswith("audio/"):
                audio = asset
        if video is None or not getattr(video, "url", None):
            raise ProviderError(
                "No video asset in inputs for mux.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        if audio is None or not getattr(audio, "url", None):
            raise ProviderError(
                "No audio asset in inputs for mux.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        work = Path(tempfile.mkdtemp(prefix="advault-mux-"))
        try:
            v_path = work / "in.mp4"
            a_path = work / "in.audio"
            out_path = work / "out.mp4"
            _materialize(video.url, v_path)
            _materialize(audio.url, a_path)

            try:
                _mux_aligned(self._ffmpeg, v_path, a_path, out_path)
            except Exception as exc:
                raise ProviderError(
                    f"ffmpeg mux failed: {exc}",
                    error_code=ProviderErrorCode.MODEL_ERROR,
                ) from exc

            payload = out_path.read_bytes()
            if self._output_dir:
                keep = Path(self._output_dir).resolve()
                keep.mkdir(parents=True, exist_ok=True)
                (keep / f"{step.step_id}.mp4").write_bytes(payload)

            try:
                url, sha = _upload_mp4(payload, step.step_id)
                asset = Asset(url=url, media_type="video/mp4", sha256=sha)
            except Exception as upload_exc:
                logger.warning("B2 upload failed for mux (%s); using file URI", upload_exc)
                local = (
                    Path(self._output_dir or tempfile.gettempdir())
                    / "advault-mux"
                    / f"{step.step_id}.mp4"
                )
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(payload)
                asset = Asset(url=local.resolve().as_uri(), media_type="video/mp4")

            step.assets.append(asset)
            return step
        finally:
            shutil.rmtree(work, ignore_errors=True)
