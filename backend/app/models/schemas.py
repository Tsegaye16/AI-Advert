from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.orm import AssetKind, RunMode, RunStatus


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    product_name: str = Field(min_length=1, max_length=200)
    product_description: str = Field(default="", max_length=2000)
    audience: str = Field(default="", max_length=300)
    tone: str = Field(default="confident", max_length=50)
    cta: str = Field(default="Shop now", max_length=100)
    brand_colors: list[str] = Field(default_factory=list, max_length=8)
    brief: str = Field(default="", max_length=5000)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    product_name: str | None = Field(default=None, min_length=1, max_length=200)
    product_description: str | None = Field(default=None, max_length=2000)
    audience: str | None = Field(default=None, max_length=300)
    tone: str | None = Field(default=None, max_length=50)
    cta: str | None = Field(default=None, max_length=100)
    brand_colors: list[str] | None = Field(default=None, max_length=8)
    brief: str | None = Field(default=None, max_length=5000)


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    product_name: str
    product_description: str
    audience: str
    tone: str
    cta: str
    brand_colors: list[Any]
    logo_b2_key: str | None
    brief: str
    created_at: datetime
    updated_at: datetime


class ProviderChoice(BaseModel):
    vendor: str | None = None
    model: str | None = None


class ProviderSelection(BaseModel):
    """Optional per-slot vendor/model override (official sample pattern)."""

    image: ProviderChoice | None = None
    video: ProviderChoice | None = None
    tts: ProviderChoice | None = None
    music: ProviderChoice | None = None


class GenerateRequest(BaseModel):
    mode: RunMode = RunMode.QUICK
    prompt_override: str | None = Field(default=None, max_length=2000)
    voiceover_script: str | None = Field(default=None, max_length=2000)
    music_prompt: str | None = Field(default=None, max_length=500)
    selection: ProviderSelection | None = None
    storyboard: bool = False
    scene_count: int | None = Field(default=None, ge=2, le=10)
    video_format: str = Field(
        default="landscape",
        description="Placement preset: landscape | square | portrait | vertical",
        max_length=20,
    )


class StoryboardSceneOut(BaseModel):
    index: int
    title: str
    voice_line: str
    prompt: str
    asset_id: str | None = None
    status: str = "planned"
    image_url: str | None = None


class StoryboardOut(BaseModel):
    run_id: str
    status: str
    scenes: list[StoryboardSceneOut]
    voiceover: str
    ready: bool = False


class StoryboardSceneUpdate(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


class RemixRequest(BaseModel):
    prompt_override: str = Field(min_length=1, max_length=2000)
    mode: RunMode | None = None
    voiceover_script: str | None = Field(default=None, max_length=2000)
    selection: ProviderSelection | None = None


class StepStatusOut(BaseModel):
    name: str
    status: str
    provider: str = ""
    model: str = ""
    fallback_used: bool = False
    error: str | None = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    campaign_id: str
    kind: AssetKind
    step_name: str
    provider: str
    model: str
    b2_key: str | None
    url: str | None
    sha256: str | None
    mime: str
    width: int | None
    height: int | None
    duration_ms: int | None
    approved: int
    created_at: datetime


class AssetPage(BaseModel):
    items: list[AssetOut]
    total: int
    page: int
    page_size: int


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    mode: RunMode
    status: RunStatus
    parent_run_id: str | None
    prompt_snapshot: dict[str, Any]
    steps: list[Any]
    error: str | None
    manifest_b2_key: str | None
    canonical_hash: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    assets: list[AssetOut] = Field(default_factory=list)


class RunSummaryOut(BaseModel):
    """Run without its asset payload — used for list views."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    mode: RunMode
    status: RunStatus
    parent_run_id: str | None
    steps: list[Any]
    error: str | None
    canonical_hash: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    asset_count: int = 0
    campaign_name: str = ""


class RunPage(BaseModel):
    items: list[RunSummaryOut]
    total: int
    page: int
    page_size: int


class PresignedUrlOut(BaseModel):
    url: str
    expires_in: int
    b2_key: str | None = None


class ProvenanceOut(BaseModel):
    asset_id: str
    run_id: str
    canonical_hash: str | None
    manifest_b2_key: str | None
    steps: list[Any]
    providers: list[str]
    models: list[str]
    parent_run_id: str | None
    manifest: dict[str, Any] | None = None


class VerifyOut(BaseModel):
    asset_id: str
    verified: bool
    manifest_ok: bool
    byte_match: bool | None
    canonical_hash: str | None
    expected_sha256: str | None
    actual_sha256: str | None
    detail: str
