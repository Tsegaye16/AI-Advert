from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.orm import AssetKind, RunMode, RunStatus


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    product_name: str = Field(min_length=1, max_length=200)
    product_description: str = ""
    audience: str = ""
    tone: str = "confident"
    cta: str = "Shop now"
    brand_colors: List[str] = Field(default_factory=list)
    brief: str = ""


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    product_name: Optional[str] = None
    product_description: Optional[str] = None
    audience: Optional[str] = None
    tone: Optional[str] = None
    cta: Optional[str] = None
    brand_colors: Optional[List[str]] = None
    brief: Optional[str] = None


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    product_name: str
    product_description: str
    audience: str
    tone: str
    cta: str
    brand_colors: List[Any]
    logo_b2_key: Optional[str]
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
    prompt_override: Optional[str] = None
    voiceover_script: Optional[str] = None
    music_prompt: Optional[str] = None
    selection: Optional[ProviderSelection] = None
    storyboard: bool = False
    scene_count: Optional[int] = Field(default=None, ge=2, le=10)


class StoryboardSceneOut(BaseModel):
    index: int
    title: str
    voice_line: str
    prompt: str
    asset_id: Optional[str] = None
    status: str = "planned"
    image_url: Optional[str] = None


class StoryboardOut(BaseModel):
    run_id: str
    status: str
    scenes: List[StoryboardSceneOut]
    voiceover: str
    ready: bool = False


class StoryboardSceneUpdate(BaseModel):
    prompt: str = Field(min_length=1)


class RemixRequest(BaseModel):
    prompt_override: str = Field(min_length=1)
    mode: Optional[RunMode] = None
    voiceover_script: Optional[str] = None
    selection: Optional[ProviderSelection] = None


class StepStatusOut(BaseModel):
    name: str
    status: str
    provider: str = ""
    model: str = ""
    fallback_used: bool = False
    error: Optional[str] = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    campaign_id: str
    kind: AssetKind
    step_name: str
    provider: str
    model: str
    b2_key: Optional[str]
    url: Optional[str]
    sha256: Optional[str]
    mime: str
    width: Optional[int]
    height: Optional[int]
    duration_ms: Optional[int]
    approved: int
    created_at: datetime


class AssetPage(BaseModel):
    items: List[AssetOut]
    total: int
    page: int
    page_size: int


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    mode: RunMode
    status: RunStatus
    parent_run_id: Optional[str]
    prompt_snapshot: dict[str, Any]
    steps: List[Any]
    error: Optional[str]
    manifest_b2_key: Optional[str]
    canonical_hash: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_at: datetime
    assets: List[AssetOut] = Field(default_factory=list)


class PresignedUrlOut(BaseModel):
    url: str
    expires_in: int
    b2_key: Optional[str] = None


class ProvenanceOut(BaseModel):
    asset_id: str
    run_id: str
    canonical_hash: Optional[str]
    manifest_b2_key: Optional[str]
    steps: List[Any]
    providers: List[str]
    models: List[str]
    parent_run_id: Optional[str]
    manifest: Optional[dict[str, Any]] = None


class VerifyOut(BaseModel):
    asset_id: str
    verified: bool
    manifest_ok: bool
    byte_match: Optional[bool]
    canonical_hash: Optional[str]
    expected_sha256: Optional[str]
    actual_sha256: Optional[str]
    detail: str
