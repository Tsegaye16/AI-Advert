import contextlib

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.storage import B2Service
from app.db import get_db
from app.jobs.runner import enqueue_run
from app.models.orm import Campaign, Run, RunStatus
from app.models.schemas import (
    CampaignCreate,
    CampaignOut,
    CampaignUpdate,
    GenerateRequest,
    RunOut,
)
from app.services.generation_service import GenerationService

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_MAX_LOGO_BYTES = 5 * 1024 * 1024


@router.post("/{campaign_id}/logo", response_model=CampaignOut)
async def upload_campaign_logo(
    campaign_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> Campaign:
    """Upload brand logo to B2 and attach to campaign for image steps."""
    settings = get_settings()
    if not settings.b2_configured:
        raise HTTPException(
            status_code=503,
            detail="Backblaze B2 is not configured — cannot store logo.",
        )
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    content_type = (file.content_type or "").lower()
    if content_type not in _LOGO_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Logo must be PNG, JPEG, WebP, or GIF.",
        )
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(payload) > _MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be under 5 MB.")

    ext = _LOGO_TYPES[content_type]
    key = f"{settings.b2_prefix}/campaigns/{campaign_id}/brand/logo{ext}"
    b2 = B2Service(settings)
    if campaign.logo_b2_key and campaign.logo_b2_key != key:
        # A stale logo left behind is preferable to failing the upload.
        with contextlib.suppress(Exception):
            b2.delete_object(campaign.logo_b2_key)
    b2.put_bytes(key, payload, content_type=content_type)
    campaign.logo_b2_key = key
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}/logo", response_model=CampaignOut)
async def delete_campaign_logo(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
) -> Campaign:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.logo_b2_key:
        with contextlib.suppress(Exception):
            B2Service().delete_object(campaign.logo_b2_key)
        campaign.logo_b2_key = None
        await db.commit()
        await db.refresh(campaign)
    return campaign


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate, db: AsyncSession = Depends(get_db)
) -> Campaign:
    campaign = Campaign(**payload.model_dump())
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.get("", response_model=list[CampaignOut])
async def list_campaigns(db: AsyncSession = Depends(get_db)) -> list[Campaign]:
    result = await db.execute(select(Campaign).order_by(Campaign.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{campaign_id}", response_model=CampaignOut)
async def get_campaign(
    campaign_id: str, db: AsyncSession = Depends(get_db)
) -> Campaign:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.patch("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
) -> Campaign:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(campaign, key, value)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.post("/{campaign_id}/generate", response_model=RunOut, status_code=202)
async def generate_campaign_assets(
    campaign_id: str,
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> RunOut:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    settings = get_settings()
    active = (
        await db.execute(
            select(func.count())
            .select_from(Run)
            .where(
                Run.campaign_id == campaign_id,
                Run.status.in_([RunStatus.QUEUED, RunStatus.RUNNING]),
            )
        )
    ).scalar_one()
    if active >= settings.max_concurrent_runs_per_campaign:
        raise HTTPException(
            status_code=429,
            detail=(
                f"{active} run(s) already in flight for this campaign. "
                "Wait for one to finish before starting another."
            ),
        )

    service = GenerationService()
    selection = None
    if payload.selection is not None:
        selection = payload.selection.model_dump(exclude_none=True)
    run = await service.create_run(
        db,
        campaign,
        mode=payload.mode,
        prompt_override=payload.prompt_override,
        voiceover_script=payload.voiceover_script,
        music_prompt=payload.music_prompt,
        selection=selection,
        storyboard=payload.storyboard,
        scene_count=payload.scene_count,
        video_format=payload.video_format,
    )
    enqueue_run(run.id)
    loaded = await service.get_run(db, run.id)
    assert loaded is not None
    return RunOut.model_validate(loaded)
