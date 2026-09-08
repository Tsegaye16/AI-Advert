from fastapi import APIRouter

from app.api.v1 import assets, campaigns, provenance, runs
from app.core.formats import format_choices
from app.core.providers import provider_status

api_router = APIRouter()
api_router.include_router(campaigns.router)
api_router.include_router(runs.router)
api_router.include_router(assets.router)
api_router.include_router(provenance.router)


@api_router.get("/providers/status", tags=["system"])
async def providers_status():
    return provider_status()


@api_router.get("/formats", tags=["system"])
async def output_formats():
    """Available placement presets (aspect ratio + render dimensions)."""
    return {"formats": format_choices()}
