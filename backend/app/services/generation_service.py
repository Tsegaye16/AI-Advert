from __future__ import annotations
import asyncio
import copy
import logging
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.config import Settings, get_settings
from app.core.pipeline import (
    build_prompts,
    run_full_pipeline,
    run_quick_pipeline,
    run_storyboard_finalize_pipeline,
    run_storyboard_phase,
)
from app.models.orm import Asset, AssetKind, Campaign, Run, RunMode, RunStatus
logger = logging.getLogger(__name__)

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _initial_steps(mode: RunMode, *, include_music: bool = False) -> list[dict[str, Any]]:
    """Seed steps matching pipeline mode so pollers see structure immediately."""
    if mode == RunMode.QUICK:
        return [
            {
                "name": "image",
                "status": "queued",
                "provider": "",
                "model": "",
                "fallback_used": False,
            }
        ]
    steps: list[dict[str, Any]] = [
        {
            "name": "image",
            "status": "queued",
            "provider": "",
            "model": "",
            "fallback_used": False,
        },
        {
            "name": "video",
            "status": "queued",
            "provider": "",
            "model": "",
            "fallback_used": False,
        },
        {
            "name": "voiceover",
            "status": "queued",
            "provider": "",
            "model": "",
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
    if include_music:
        steps.insert(
            3,
            {
                "name": "music",
                "status": "queued",
                "provider": "",
                "model": "",
                "fallback_used": False,
            },
        )
    return steps

class GenerationService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
    async def create_run(
        self,
        db: AsyncSession,
        campaign: Campaign,
        *,
        mode: RunMode,
        prompt_override: str | None = None,
        voiceover_script: str | None = None,
        music_prompt: str | None = None,
        parent_run_id: str | None = None,
        selection: dict[str, Any] | None = None,
        storyboard: bool = False,
        scene_count: int | None = None,
    ) -> Run:
        prompts = build_prompts(
            product_name=campaign.product_name,
            product_description=campaign.product_description,
            audience=campaign.audience,
            tone=campaign.tone,
            cta=campaign.cta,
            prompt_override=prompt_override,
            voiceover_script=voiceover_script,
            music_prompt=music_prompt,
            has_logo=bool(campaign.logo_b2_key),
        )
        if storyboard and mode == RunMode.FULL and not (voiceover_script or "").strip():
            prompts["voice"] = ""
        snapshot: dict[str, Any] = {**prompts}
        if selection:
            snapshot["selection"] = selection
        if storyboard and mode == RunMode.FULL:
            snapshot["storyboard"] = {
                "enabled": True,
                "phase": "plan",
                "scene_count": scene_count,
                "scenes": [],
            }
        include_music = bool(self.settings.include_music and mode == RunMode.FULL)
        steps_seed = _initial_steps(mode, include_music=include_music)
        if storyboard and mode == RunMode.FULL:
            steps_seed = [
                {
                    "name": "storyboard-plan",
                    "status": "queued",
                    "provider": "advault",
                    "model": "scene-planner",
                    "fallback_used": False,
                }
            ]
        run = Run(
            campaign_id=campaign.id,
            mode=mode,
            status=RunStatus.QUEUED,
            parent_run_id=parent_run_id,
            prompt_snapshot=snapshot,
            steps=steps_seed,
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return run
    async def get_run(self, db: AsyncSession, run_id: str) -> Run | None:
        result = await db.execute(
            select(Run)
            .where(Run.id == run_id)
            .options(selectinload(Run.assets))
        )
        return result.scalar_one_or_none()
    async def execute_run(self, run_id: str) -> None:
        """Execute pipeline in a worker context with its own DB session."""
        from app.db import SessionLocal
        async with SessionLocal() as db:
            run = await self.get_run(db, run_id)
            if run is None:
                logger.error("Run %s not found", run_id)
                return
            campaign = await db.get(Campaign, run.campaign_id)
            if campaign is None:
                run.status = RunStatus.FAILED
                run.error = "Campaign not found"
                run.finished_at = _now()
                await db.commit()
                return
            include_music = bool(
                self.settings.include_music and run.mode == RunMode.FULL
            )
            # Seed / refresh steps_state before pipeline so pollers see structure.
            run.steps = _initial_steps(run.mode, include_music=include_music)
            run.status = RunStatus.RUNNING
            run.started_at = _now()
            await db.commit()
            loop = asyncio.get_running_loop()
            async def _persist_steps(steps: list[dict[str, Any]]) -> None:
                async with SessionLocal() as progress_db:
                    row = await progress_db.get(Run, run_id)
                    if row is None:
                        return
                    row.steps = copy.deepcopy(steps)
                    await progress_db.commit()
            def on_progress(steps: list[dict[str, Any]]) -> None:
                """Called from worker thread inside asyncio.to_thread pipelines."""
                try:
                    fut = asyncio.run_coroutine_threadsafe(
                        _persist_steps(copy.deepcopy(steps)), loop
                    )
                    fut.result(timeout=15)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Failed to persist mid-run steps for %s: %s", run_id, exc)
            try:
                snapshot = dict(run.prompt_snapshot or {})
                selection = snapshot.pop("selection", None)
                storyboard_meta = snapshot.pop("storyboard", None) or {}
                prompts = {
                    k: v
                    for k, v in snapshot.items()
                    if k in {"image", "video", "voice", "music"}
                }
                is_storyboard = bool(storyboard_meta.get("enabled"))
                storyboard_phase = storyboard_meta.get("phase", "plan")

                if self.settings.demo_mode:
                    # Simulate step progression so UI pollers see mid-run updates.
                    # Await on the event loop — do not block via fut.result().
                    for step in run.steps or []:
                        step["status"] = "running"
                        await _persist_steps(list(run.steps or []))
                        await asyncio.sleep(0.4)
                        step["status"] = "succeeded"
                        await _persist_steps(list(run.steps or []))
                    result = await self._demo_result(run)
                elif (
                    is_storyboard
                    and run.mode == RunMode.FULL
                    and storyboard_phase == "finalize"
                ):
                    from app.services.storyboard_service import StoryboardService

                    scene_urls = await StoryboardService.scene_image_urls(db, run)
                    scene_durs = StoryboardService.scene_duration_list(run)
                    run.steps = _initial_steps(run.mode, include_music=include_music)
                    result = await asyncio.to_thread(
                        run_storyboard_finalize_pipeline,
                        campaign_id=campaign.id,
                        run_id=run.id,
                        prompts=prompts,
                        scene_image_urls=scene_urls,
                        scene_durations=scene_durs,
                        settings=self.settings,
                        selection=selection,
                        include_music=include_music,
                        on_progress=on_progress,
                    )
                elif is_storyboard and run.mode == RunMode.FULL:
                    campaign_context = {
                        "product_name": campaign.product_name,
                        "product_description": campaign.product_description,
                        "audience": campaign.audience,
                        "tone": campaign.tone,
                        "cta": campaign.cta,
                    }
                    result = await asyncio.to_thread(
                        run_storyboard_phase,
                        campaign_id=campaign.id,
                        run_id=run.id,
                        campaign_context=campaign_context,
                        prompts=prompts,
                        storyboard_meta=storyboard_meta,
                        settings=self.settings,
                        selection=selection,
                        logo_b2_key=campaign.logo_b2_key,
                        on_progress=on_progress,
                    )
                    from app.services.storyboard_service import persist_storyboard_assets

                    run.steps = result.steps
                    run.manifest_b2_key = result.manifest_b2_key
                    run.canonical_hash = result.canonical_hash
                    run.genblaze_run_id = result.genblaze_run_id
                    await persist_storyboard_assets(
                        db,
                        run=run,
                        campaign=campaign,
                        scenes=result.storyboard_scenes,
                        assets=result.assets,
                    )
                    run.status = RunStatus.STORYBOARD
                    run.error = None
                    run.finished_at = _now()
                    await db.commit()
                    return
                elif run.mode == RunMode.FULL:
                    result = await asyncio.to_thread(
                        run_full_pipeline,
                        campaign_id=campaign.id,
                        run_id=run.id,
                        prompts=prompts,
                        settings=self.settings,
                        selection=selection,
                        include_music=include_music,
                        logo_b2_key=campaign.logo_b2_key,
                        on_progress=on_progress,
                    )
                else:
                    result = await asyncio.to_thread(
                        run_quick_pipeline,
                        campaign_id=campaign.id,
                        run_id=run.id,
                        prompts=prompts,
                        settings=self.settings,
                        selection=selection,
                        logo_b2_key=campaign.logo_b2_key,
                        on_progress=on_progress,
                    )
                run.steps = result.steps
                run.manifest_b2_key = result.manifest_b2_key
                run.canonical_hash = result.canonical_hash
                run.genblaze_run_id = result.genblaze_run_id
                if not result.assets and not self.settings.demo_mode:
                    run.status = RunStatus.FAILED
                    run.error = "Pipeline finished with zero assets"
                    run.finished_at = _now()
                    await db.commit()
                    return
                run.status = RunStatus.SUCCEEDED
                run.error = None
                run.finished_at = _now()
                for item in result.assets:
                    kind_raw = item.get("kind", "other")
                    try:
                        kind = AssetKind(kind_raw)
                    except ValueError:
                        kind = AssetKind.OTHER
                    db.add(
                        Asset(
                            run_id=run.id,
                            campaign_id=campaign.id,
                            kind=kind,
                            step_name=item.get("step_name") or "",
                            provider=item.get("provider") or "",
                            model=item.get("model") or "",
                            b2_key=item.get("b2_key"),
                            url=item.get("url"),
                            sha256=item.get("sha256"),
                            mime=item.get("mime") or "application/octet-stream",
                            width=item.get("width"),
                            height=item.get("height"),
                            duration_ms=item.get("duration_ms"),
                        )
                    )
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                logger.exception("Pipeline failed for run %s", run_id)
                run.status = RunStatus.FAILED
                run.error = str(exc)
                run.finished_at = _now()
                await db.commit()
    async def _demo_result(self, run: Run):
        """Synthetic success path when DEMO_MODE=true (no provider keys needed)."""
        from app.core.pipeline import PipelineResult
        steps = [
            {
                "name": "image",
                "status": "succeeded",
                "provider": "demo",
                "model": "demo-image",
                "fallback_used": False,
            }
        ]
        assets = [
            {
                "kind": "image",
                "step_name": "image",
                "provider": "demo",
                "model": "demo-image",
                "url": "https://placehold.co/1024x1024/png?text=AdVault+Demo",
                "b2_key": None,
                "sha256": "0" * 64,
                "mime": "image/png",
                "width": 1024,
                "height": 1024,
                "duration_ms": None,
            }
        ]
        if run.mode == RunMode.FULL:
            steps = [
                {
                    "name": "image",
                    "status": "succeeded",
                    "provider": "demo",
                    "model": "demo-image",
                    "fallback_used": False,
                },
                {
                    "name": "video",
                    "status": "succeeded",
                    "provider": "demo",
                    "model": "demo-video",
                    "fallback_used": False,
                },
                {
                    "name": "voiceover",
                    "status": "succeeded",
                    "provider": "demo",
                    "model": "demo-tts",
                    "fallback_used": False,
                },
                {
                    "name": "compose",
                    "status": "succeeded",
                    "provider": "ffmpeg",
                    "model": "demo-mux",
                    "fallback_used": False,
                },
            ]
            assets.append(
                {
                    "kind": "final",
                    "step_name": "compose",
                    "provider": "ffmpeg",
                    "model": "demo-mux",
                    "url": "https://placehold.co/1280x720/mp4?text=AdVault+Final",
                    "b2_key": None,
                    "sha256": "1" * 64,
                    "mime": "video/mp4",
                    "width": 1280,
                    "height": 720,
                    "duration_ms": 8000,
                }
            )
        return PipelineResult(
            mode=run.mode.value,
            genblaze_run_id=f"demo-{run.id}",
            canonical_hash="demo" + ("0" * 60),
            manifest_verified=True,
            assets=assets,
            steps=steps,
            manifest_b2_key=None,
        )
