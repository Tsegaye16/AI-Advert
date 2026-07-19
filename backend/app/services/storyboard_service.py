"""Storyboard orchestration (scene prompts, regenerate, finalize)."""

from __future__ import annotations

import asyncio
import copy
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import Settings, get_settings
from app.core.storyboard import generate_scene_image, scene_durations_from_lines
from app.core.storage import B2Service
from app.models.orm import Asset, AssetKind, Campaign, Run, RunStatus
from app.models.schemas import StoryboardOut, StoryboardSceneOut
from app.services.b2_service import B2AppService
from app.services.generation_service import GenerationService

logger = logging.getLogger(__name__)


def _storyboard_meta(snapshot: dict[str, Any]) -> dict[str, Any]:
    return dict(snapshot.get("storyboard") or {})


def _persist_prompt_snapshot(run: Run, snapshot: dict[str, Any]) -> None:
    """SQLite JSON columns need deep copy + flag_modified for nested updates."""
    run.prompt_snapshot = copy.deepcopy(snapshot)
    flag_modified(run, "prompt_snapshot")


def _asset_view_url(asset: Asset) -> str | None:
    if asset.b2_key:
        try:
            url, _ = B2AppService().presign(asset.b2_key)
            return url
        except Exception:  # noqa: BLE001
            return asset.url
    return asset.url


async def _resolve_scene_asset(
    db: AsyncSession,
    *,
    run_id: str,
    row: dict[str, Any],
) -> Asset | None:
    """Resolve scene asset by snapshot id, falling back to latest step_name match."""
    asset_id = row.get("asset_id")
    if asset_id:
        asset = await db.get(Asset, asset_id)
        if asset is not None:
            return asset

    scene_index = int(row.get("index", 0))
    step_name = f"scene-{scene_index + 1}"
    result = await db.execute(
        select(Asset)
        .where(Asset.run_id == run_id, Asset.step_name == step_name)
        .order_by(Asset.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


class StoryboardService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    async def build_storyboard_out(
        self, db: AsyncSession, run: Run
    ) -> StoryboardOut:
        snapshot = dict(run.prompt_snapshot or {})
        meta = _storyboard_meta(snapshot)
        scenes_raw = list(meta.get("scenes") or [])

        scenes: list[StoryboardSceneOut] = []
        healed = False
        for row in scenes_raw:
            asset_id = row.get("asset_id")
            image_url = None
            resolved_id = asset_id
            asset = await _resolve_scene_asset(db, run_id=run.id, row=row)
            if asset is not None:
                resolved_id = asset.id
                image_url = _asset_view_url(asset)
                # Self-heal stale snapshot pointers after regenerate.
                if asset_id != asset.id:
                    row["asset_id"] = asset.id
                    row["status"] = "ready"
                    healed = True
            scenes.append(
                StoryboardSceneOut(
                    index=int(row.get("index", 0)),
                    title=str(
                        row.get("title") or f"Scene {int(row.get('index', 0)) + 1}"
                    ),
                    voice_line=str(row.get("voice_line") or ""),
                    prompt=str(row.get("prompt") or ""),
                    asset_id=resolved_id,
                    status=str(row.get("status") or "planned"),
                    image_url=image_url,
                )
            )

        # Persist healed asset_id links when we recovered from step_name fallback.
        if healed:
            meta["scenes"] = scenes_raw
            snapshot["storyboard"] = meta
            _persist_prompt_snapshot(run, snapshot)
            await db.commit()

        ready = bool(
            scenes
            and all(
                s.status == "ready" and s.asset_id and s.image_url for s in scenes
            )
            and run.status
            in {RunStatus.STORYBOARD, RunStatus.SUCCEEDED, RunStatus.RUNNING}
        )
        return StoryboardOut(
            run_id=run.id,
            status=run.status.value,
            scenes=scenes,
            voiceover=str(snapshot.get("voice") or ""),
            ready=ready,
        )

    async def update_scene_prompt(
        self,
        db: AsyncSession,
        run: Run,
        scene_index: int,
        prompt: str,
    ) -> StoryboardOut:
        snapshot = dict(run.prompt_snapshot or {})
        meta = _storyboard_meta(snapshot)
        scenes = list(meta.get("scenes") or [])
        found = False
        for row in scenes:
            if int(row.get("index", -1)) == scene_index:
                row["prompt"] = prompt.strip()
                found = True
                break
        if not found:
            raise ValueError(f"Scene {scene_index + 1} not found")
        meta["scenes"] = scenes
        snapshot["storyboard"] = meta
        _persist_prompt_snapshot(run, snapshot)
        await db.commit()
        gen = GenerationService(self.settings)
        loaded = await gen.get_run(db, run.id)
        assert loaded is not None
        return await self.build_storyboard_out(db, loaded)

    async def regenerate_scene(
        self,
        db: AsyncSession,
        run: Run,
        campaign: Campaign,
        scene_index: int,
    ) -> StoryboardOut:
        snapshot = dict(run.prompt_snapshot or {})
        meta = _storyboard_meta(snapshot)
        scenes = list(meta.get("scenes") or [])
        target = None
        for row in scenes:
            if int(row.get("index", -1)) == scene_index:
                target = row
                break
        if target is None:
            raise ValueError(f"Scene {scene_index + 1} not found")

        selection = snapshot.get("selection") or {}
        image_sel = selection.get("image") or {}
        from app.core import providers as provider_factory

        image_provider, image_model, image_vendor = provider_factory.get_image_provider(
            self.settings,
            vendor=image_sel.get("vendor"),
            model=image_sel.get("model"),
        )
        provider_name = str(getattr(image_provider, "name", "") or "image")
        b2 = B2Service(self.settings)

        old_asset_id = target.get("asset_id")
        if old_asset_id:
            old = await db.get(Asset, old_asset_id)
            if old is not None:
                if old.b2_key or old.thumbnail_b2_key:
                    try:
                        B2AppService().delete_asset_objects(
                            b2_key=old.b2_key,
                            campaign_id=old.campaign_id,
                            asset_id=old.id,
                            approved=bool(old.approved),
                            thumbnail_b2_key=old.thumbnail_b2_key,
                        )
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Old scene asset B2 delete failed: %s", exc)
                await db.delete(old)

        target["status"] = "generating"
        meta["scenes"] = scenes
        snapshot["storyboard"] = meta
        _persist_prompt_snapshot(run, snapshot)
        await db.commit()

        asset_dict = await asyncio.to_thread(
            generate_scene_image,
            prompt=str(target.get("prompt") or ""),
            run_id=run.id,
            scene_index=scene_index,
            image_provider=image_provider,
            image_model=image_model,
            image_vendor=image_vendor,
            provider_name=provider_name,
            b2=b2,
            logo_b2_key=campaign.logo_b2_key,
        )

        new_asset = Asset(
            run_id=run.id,
            campaign_id=campaign.id,
            kind=AssetKind.IMAGE,
            step_name=asset_dict.get("step_name") or f"scene-{scene_index + 1}",
            provider=asset_dict.get("provider") or image_vendor,
            model=asset_dict.get("model") or image_model,
            b2_key=asset_dict.get("b2_key"),
            url=asset_dict.get("url"),
            sha256=asset_dict.get("sha256"),
            mime=asset_dict.get("mime") or "image/png",
            width=asset_dict.get("width"),
            height=asset_dict.get("height"),
        )
        db.add(new_asset)
        await db.flush()

        target["asset_id"] = new_asset.id
        target["status"] = "ready"
        meta["scenes"] = scenes
        snapshot["storyboard"] = meta
        _persist_prompt_snapshot(run, snapshot)
        await db.commit()
        await db.refresh(new_asset)
        await db.refresh(run)

        gen = GenerationService(self.settings)
        loaded = await gen.get_run(db, run.id)
        assert loaded is not None
        return await self.build_storyboard_out(db, loaded)

    async def finalize(self, db: AsyncSession, run: Run) -> Run:
        if run.status != RunStatus.STORYBOARD:
            raise ValueError("Run is not awaiting storyboard review")
        snapshot = dict(run.prompt_snapshot or {})
        meta = _storyboard_meta(snapshot)
        scenes = list(meta.get("scenes") or [])
        if not scenes or any(not s.get("asset_id") for s in scenes):
            raise ValueError("All scenes need generated images before continuing")

        meta["phase"] = "finalize"
        snapshot["storyboard"] = meta
        _persist_prompt_snapshot(run, snapshot)
        run.status = RunStatus.QUEUED
        run.error = None
        await db.commit()
        await db.refresh(run)
        return run

    @staticmethod
    async def scene_image_urls(db: AsyncSession, run: Run) -> list[str]:
        snapshot = dict(run.prompt_snapshot or {})
        meta = _storyboard_meta(snapshot)
        scenes = sorted(meta.get("scenes") or [], key=lambda s: int(s.get("index", 0)))
        urls: list[str] = []
        for row in scenes:
            asset = await _resolve_scene_asset(db, run_id=run.id, row=row)
            if asset is None:
                raise ValueError("Missing scene image asset")
            url = _asset_view_url(asset)
            if not url:
                raise ValueError(f"Scene asset {asset.id} has no URL")
            urls.append(url)
        return urls

    @staticmethod
    def scene_duration_list(run: Run) -> list[float]:
        snapshot = dict(run.prompt_snapshot or {})
        meta = _storyboard_meta(snapshot)
        scenes = sorted(meta.get("scenes") or [], key=lambda s: int(s.get("index", 0)))
        lines = [str(s.get("voice_line") or "") for s in scenes]
        return scene_durations_from_lines(lines)


async def persist_storyboard_assets(
    db: AsyncSession,
    *,
    run: Run,
    campaign: Campaign,
    scenes: list[dict[str, Any]],
    assets: list[dict[str, Any]],
) -> None:
    """Attach DB asset ids back into prompt_snapshot scenes."""
    snapshot = dict(run.prompt_snapshot or {})
    meta = _storyboard_meta(snapshot)
    scene_rows = list(meta.get("scenes") or scenes)

    for idx, asset_dict in enumerate(assets):
        row = scene_rows[idx] if idx < len(scene_rows) else scenes[idx]
        asset = Asset(
            run_id=run.id,
            campaign_id=campaign.id,
            kind=AssetKind.IMAGE,
            step_name=asset_dict.get("step_name") or f"scene-{idx + 1}",
            provider=asset_dict.get("provider") or "",
            model=asset_dict.get("model") or "",
            b2_key=asset_dict.get("b2_key"),
            url=asset_dict.get("url"),
            sha256=asset_dict.get("sha256"),
            mime=asset_dict.get("mime") or "image/png",
            width=asset_dict.get("width"),
            height=asset_dict.get("height"),
        )
        db.add(asset)
        await db.flush()
        row["asset_id"] = asset.id
        row["status"] = "ready"

    meta["scenes"] = scene_rows
    meta["phase"] = "review"
    snapshot["storyboard"] = meta
    voice_lines = [
        str(row.get("voice_line") or "").strip()
        for row in scene_rows
        if row.get("voice_line")
    ]
    if voice_lines:
        snapshot["voice"] = " ".join(voice_lines)
    run.prompt_snapshot = copy.deepcopy(snapshot)
    flag_modified(run, "prompt_snapshot")
