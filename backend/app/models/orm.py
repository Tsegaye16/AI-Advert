import enum
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid4())


class RunMode(str, enum.Enum):
    QUICK = "quick"
    FULL = "full"


class RunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    STORYBOARD = "storyboard"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AssetKind(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    FINAL = "final"
    MANIFEST = "manifest"
    OTHER = "other"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200))
    product_name: Mapped[str] = mapped_column(String(200))
    product_description: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[str] = mapped_column(String(300), default="")
    tone: Mapped[str] = mapped_column(String(100), default="confident")
    cta: Mapped[str] = mapped_column(String(200), default="Shop now")
    brand_colors: Mapped[list[Any]] = mapped_column(JSON, default=list)
    logo_b2_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    brief: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    runs: Mapped[list["Run"]] = relationship(back_populates="campaign", cascade="all")
    assets: Mapped[list["Asset"]] = relationship(
        back_populates="campaign", cascade="all"
    )


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id"), index=True
    )
    mode: Mapped[RunMode] = mapped_column(Enum(RunMode), default=RunMode.QUICK)
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus), default=RunStatus.QUEUED, index=True
    )
    parent_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("runs.id"), nullable=True
    )
    prompt_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    steps: Mapped[list[Any]] = mapped_column(JSON, default=list)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manifest_b2_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    canonical_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    genblaze_run_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    campaign: Mapped["Campaign"] = relationship(back_populates="runs")
    assets: Mapped[list["Asset"]] = relationship(back_populates="run", cascade="all")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id"), index=True)
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id"), index=True
    )
    kind: Mapped[AssetKind] = mapped_column(Enum(AssetKind), default=AssetKind.OTHER)
    step_name: Mapped[str] = mapped_column(String(100), default="")
    provider: Mapped[str] = mapped_column(String(100), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    b2_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    mime: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thumbnail_b2_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    approved: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped["Run"] = relationship(back_populates="assets")
    campaign: Mapped["Campaign"] = relationship(back_populates="assets")
