from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.jobs.runner import enqueue_run
from app.models.orm import Campaign
from app.models.schemas import (
    RemixRequest,
    RunOut,
    StoryboardOut,
    StoryboardSceneUpdate,
)
from app.services.generation_service import GenerationService
from app.services.storyboard_service import StoryboardService

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("/{run_id}", response_model=RunOut)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)) -> RunOut:
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut.model_validate(run)


@router.post("/{run_id}/remix", response_model=RunOut, status_code=202)
async def remix_run(
    run_id: str,
    payload: RemixRequest,
    db: AsyncSession = Depends(get_db),
) -> RunOut:
    service = GenerationService()
    parent = await service.get_run(db, run_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Parent run not found")

    campaign = await db.get(Campaign, parent.campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    mode = payload.mode or parent.mode
    selection = None
    if payload.selection is not None:
        selection = payload.selection.model_dump(exclude_none=True)
    run = await service.create_run(
        db,
        campaign,
        mode=mode,
        prompt_override=payload.prompt_override,
        voiceover_script=payload.voiceover_script,
        parent_run_id=parent.id,
        selection=selection,
    )
    enqueue_run(run.id)
    loaded = await service.get_run(db, run.id)
    assert loaded is not None
    return RunOut.model_validate(loaded)


@router.get("/{run_id}/storyboard", response_model=StoryboardOut)
async def get_storyboard(run_id: str, db: AsyncSession = Depends(get_db)) -> StoryboardOut:
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return await StoryboardService().build_storyboard_out(db, run)


@router.patch(
    "/{run_id}/storyboard/scenes/{scene_index}",
    response_model=StoryboardOut,
)
async def update_storyboard_scene(
    run_id: str,
    scene_index: int,
    payload: StoryboardSceneUpdate,
    db: AsyncSession = Depends(get_db),
) -> StoryboardOut:
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    sb = StoryboardService()
    try:
        return await sb.update_scene_prompt(db, run, scene_index, payload.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{run_id}/storyboard/scenes/{scene_index}/regenerate",
    response_model=StoryboardOut,
)
async def regenerate_storyboard_scene(
    run_id: str,
    scene_index: int,
    db: AsyncSession = Depends(get_db),
) -> StoryboardOut:
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    campaign = await db.get(Campaign, run.campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    sb = StoryboardService()
    try:
        return await sb.regenerate_scene(db, run, campaign, scene_index)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/{run_id}/storyboard/finalize", response_model=RunOut, status_code=202)
async def finalize_storyboard(
    run_id: str, db: AsyncSession = Depends(get_db)
) -> RunOut:
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    sb = StoryboardService()
    try:
        run = await sb.finalize(db, run)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    enqueue_run(run.id)
    loaded = await service.get_run(db, run.id)
    assert loaded is not None
    return RunOut.model_validate(loaded)
