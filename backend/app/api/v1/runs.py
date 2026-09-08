import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.db import get_db
from app.jobs.runner import clear_cancelled, enqueue_run, is_running, request_cancel
from app.models.orm import TERMINAL_RUN_STATUSES, Asset, Campaign, Run, RunStatus
from app.models.schemas import (
    RemixRequest,
    RunOut,
    RunPage,
    RunSummaryOut,
    StoryboardOut,
    StoryboardSceneUpdate,
)
from app.services.generation_service import GenerationService
from app.services.storyboard_service import StoryboardService

router = APIRouter(prefix="/runs", tags=["runs"])

# How long a retry waits for a cancelled worker to release the run (~2s total).
RETRY_RELEASE_ATTEMPTS = 20
RETRY_RELEASE_INTERVAL_SECONDS = 0.1


@router.get("", response_model=RunPage)
async def list_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    campaign_id: str | None = Query(None),
    status: RunStatus | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> RunPage:
    """Paginated run history, newest first."""
    filters = []
    if campaign_id:
        filters.append(Run.campaign_id == campaign_id)
    if status:
        filters.append(Run.status == status)

    count_q = select(func.count()).select_from(Run)
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar_one()

    asset_count = (
        select(Asset.run_id, func.count(Asset.id).label("n"))
        .group_by(Asset.run_id)
        .subquery()
    )
    rows_q = (
        select(Run, Campaign.name, func.coalesce(asset_count.c.n, 0))
        .join(Campaign, Campaign.id == Run.campaign_id, isouter=True)
        .join(asset_count, asset_count.c.run_id == Run.id, isouter=True)
        .order_by(Run.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if filters:
        rows_q = rows_q.where(*filters)

    rows = (await db.execute(rows_q)).all()
    items = [
        RunSummaryOut.model_validate(run).model_copy(
            update={"campaign_name": name or "", "asset_count": count}
        )
        for run, name, count in rows
    ]
    return RunPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/{run_id}", response_model=RunOut)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)) -> RunOut:
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut.model_validate(run)


@router.post("/{run_id}/cancel", response_model=RunOut, status_code=202)
async def cancel_run_endpoint(
    run_id: str, db: AsyncSession = Depends(get_db)
) -> RunOut:
    """Request cancellation of an in-flight run.

    Cancellation is cooperative: the provider call already in flight runs to
    completion, then the pipeline unwinds at the next step boundary. Assets
    already written to storage are kept.
    """
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in TERMINAL_RUN_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Run already finished with status {run.status.value}",
        )

    request_cancel(run_id)

    run.status = RunStatus.CANCELLED
    run.error = "Cancelled by user"
    run.finished_at = datetime.now(UTC)
    for step in run.steps or []:
        if step.get("status") in {"queued", "running"}:
            step["status"] = "cancelled"
    flag_modified(run, "steps")
    await db.commit()

    loaded = await service.get_run(db, run_id)
    assert loaded is not None
    return RunOut.model_validate(loaded)


@router.post("/{run_id}/retry", response_model=RunOut, status_code=202)
async def retry_run(run_id: str, db: AsyncSession = Depends(get_db)) -> RunOut:
    """Re-queue a failed or cancelled run with its original prompt snapshot."""
    service = GenerationService()
    run = await service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
        raise HTTPException(
            status_code=409, detail="Only failed or cancelled runs can be retried"
        )

    # A just-cancelled worker is usually a fraction of a second from releasing
    # the run; wait briefly rather than bouncing the user with a 409.
    for _ in range(RETRY_RELEASE_ATTEMPTS):
        if not is_running(run_id):
            break
        await asyncio.sleep(RETRY_RELEASE_INTERVAL_SECONDS)
    else:
        raise HTTPException(
            status_code=409,
            detail="The previous attempt is still unwinding. Try again in a moment.",
        )

    # Without this the freshly queued run would immediately cancel itself.
    clear_cancelled(run_id)

    run.status = RunStatus.QUEUED
    run.error = None
    run.steps = []
    run.started_at = None
    run.finished_at = None
    await db.commit()

    enqueue_run(run_id)
    loaded = await service.get_run(db, run_id)
    assert loaded is not None
    return RunOut.model_validate(loaded)


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
    except Exception as exc:
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
