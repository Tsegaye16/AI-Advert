from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models.orm import Asset, Run
from app.models.schemas import ProvenanceOut, VerifyOut
from app.services.provenance_service import ProvenanceService

router = APIRouter(prefix="/assets", tags=["provenance"])


async def _load_run_with_assets(db: AsyncSession, run_id: str) -> Run | None:
    result = await db.execute(
        select(Run).where(Run.id == run_id).options(selectinload(Run.assets))
    )
    return result.scalar_one_or_none()


@router.get("/{asset_id}/provenance", response_model=ProvenanceOut)
async def get_provenance(
    asset_id: str, db: AsyncSession = Depends(get_db)
) -> ProvenanceOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    run = await _load_run_with_assets(db, asset.run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return await ProvenanceService().build_provenance(db, asset, run)


@router.post("/{asset_id}/verify", response_model=VerifyOut)
async def verify_asset(
    asset_id: str, db: AsyncSession = Depends(get_db)
) -> VerifyOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    run = await _load_run_with_assets(db, asset.run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return await ProvenanceService().verify_asset(db, asset, run)
