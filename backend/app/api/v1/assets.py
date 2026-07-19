from __future__ import annotations

import mimetypes
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.orm import Asset
from app.models.schemas import AssetOut, AssetPage, PresignedUrlOut
from app.services.b2_service import B2AppService

router = APIRouter(tags=["assets"])


def _asset_out_with_view_url(asset: Asset) -> AssetOut:
    """Return AssetOut with a browser-usable URL (presigned when on private B2)."""
    out = AssetOut.model_validate(asset)
    if not asset.b2_key:
        return out
    try:
        url, _ttl = B2AppService().presign(asset.b2_key)
        return out.model_copy(update={"url": url})
    except Exception:  # noqa: BLE001
        return out


def _download_filename(asset: Asset) -> str:
    ext = ""
    if asset.mime:
        guessed = mimetypes.guess_extension(asset.mime.split(";")[0].strip()) or ""
        ext = guessed
    if not ext and asset.b2_key and "." in asset.b2_key.rsplit("/", 1)[-1]:
        ext = "." + asset.b2_key.rsplit(".", 1)[-1]
    kind = asset.kind.value if hasattr(asset.kind, "value") else str(asset.kind)
    step = (asset.step_name or kind).replace("/", "-")
    return f"advault-{step}-{asset.id[:8]}{ext}"


@router.get("/assets", response_model=AssetPage)
async def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    campaign_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None, description="Filter assets for one pipeline run"),
    db: AsyncSession = Depends(get_db),
) -> AssetPage:
    """Paginated asset listing across campaigns (optional campaign/run filter)."""
    filters = []
    if campaign_id:
        filters.append(Asset.campaign_id == campaign_id)
    if run_id:
        filters.append(Asset.run_id == run_id)

    count_q = select(func.count()).select_from(Asset)
    if filters:
        count_q = count_q.where(*filters)
    total = int((await db.execute(count_q)).scalar_one())

    q = select(Asset).order_by(Asset.created_at.desc())
    if filters:
        q = q.where(*filters)
    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return AssetPage(
        items=[_asset_out_with_view_url(a) for a in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/campaigns/{campaign_id}/assets", response_model=list[AssetOut])
async def list_campaign_assets(
    campaign_id: str, db: AsyncSession = Depends(get_db)
) -> list[AssetOut]:
    result = await db.execute(
        select(Asset)
        .where(Asset.campaign_id == campaign_id)
        .order_by(Asset.created_at.desc())
    )
    return [_asset_out_with_view_url(a) for a in result.scalars().all()]


@router.get("/assets/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db)) -> AssetOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_out_with_view_url(asset)


@router.get("/assets/{asset_id}/url", response_model=PresignedUrlOut)
async def get_asset_url(
    asset_id: str, db: AsyncSession = Depends(get_db)
) -> PresignedUrlOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.b2_key:
        try:
            url, ttl = B2AppService().presign(asset.b2_key)
            return PresignedUrlOut(url=url, expires_in=ttl, b2_key=asset.b2_key)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=503, detail=f"Unable to presign asset: {exc}"
            ) from exc

    if asset.url:
        return PresignedUrlOut(url=asset.url, expires_in=0, b2_key=None)

    raise HTTPException(status_code=404, detail="Asset has no downloadable URL")


@router.get("/assets/{asset_id}/download")
async def download_asset(
    asset_id: str,
    redirect: bool = Query(False, description="If true, 307 to B2 presign"),
    db: AsyncSession = Depends(get_db),
):
    """Stream object with Content-Disposition: attachment (default).

    Set ``redirect=true`` to 307 to a B2 presigned URL instead.
    Streaming is the default so browser XHR/blob downloads avoid CORS.
    """
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    filename = _download_filename(asset)
    disposition = f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'

    if asset.b2_key:
        b2 = B2AppService()
        if redirect:
            try:
                url, _ttl = b2.presign_download(asset.b2_key, filename=filename)
                return RedirectResponse(url=url, status_code=307)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=503, detail=f"Unable to presign download: {exc}"
                ) from exc
        try:
            obj = b2.b2.client.get_object(Bucket=b2.b2.bucket, Key=asset.b2_key)
            body = obj["Body"]
            media = asset.mime or obj.get("ContentType") or "application/octet-stream"

            def _iter():
                while True:
                    chunk = body.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk

            return StreamingResponse(
                _iter(),
                media_type=media,
                headers={"Content-Disposition": disposition},
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=503, detail=f"Unable to download asset: {exc}"
            ) from exc

    if asset.url:
        return RedirectResponse(url=asset.url, status_code=307)

    raise HTTPException(status_code=404, detail="Asset has no downloadable URL")


@router.post("/assets/{asset_id}/approve", response_model=AssetOut)
async def approve_asset(
    asset_id: str, db: AsyncSession = Depends(get_db)
) -> AssetOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not asset.b2_key:
        raise HTTPException(
            status_code=400, detail="Asset is not stored on B2; cannot approve-copy"
        )

    try:
        # Copy to approved/ archive but KEEP original b2_key so download/view keep working.
        B2AppService().approve_copy(asset.b2_key, asset.campaign_id, asset.id)
        asset.approved = 1
        try:
            url, _ttl = B2AppService().presign(asset.b2_key)
            asset.url = url
        except Exception:  # noqa: BLE001
            pass
        await db.commit()
        await db.refresh(asset)
        return _asset_out_with_view_url(asset)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: str, db: AsyncSession = Depends(get_db)
) -> Response:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.b2_key or asset.thumbnail_b2_key:
        try:
            B2AppService().delete_asset_objects(
                b2_key=asset.b2_key,
                campaign_id=asset.campaign_id,
                asset_id=asset.id,
                approved=bool(asset.approved),
                thumbnail_b2_key=asset.thumbnail_b2_key,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=503, detail=f"Unable to delete asset from storage: {exc}"
            ) from exc

    await db.delete(asset)
    await db.commit()
    return Response(status_code=204)
