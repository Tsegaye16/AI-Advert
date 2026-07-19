from functools import lru_cache
from typing import Annotated, List

from pydantic import AliasChoices, BeforeValidator, Field
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _split_csv(value: object) -> object:
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return value


CsvList = Annotated[List[str], NoDecode, BeforeValidator(_split_csv)]


class Settings(BaseSettings):
    """Type-safe configuration loaded from environment / .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AdVault"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: CsvList = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    database_url: str = "sqlite+aiosqlite:///./advault.db"

    # Backblaze B2
    b2_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = "advault-media"
    b2_region: str = "us-west-004"
    b2_endpoint: str = "https://s3.us-west-004.backblazeb2.com"
    b2_public_url_base: str = ""
    b2_prefix: str = "advault"
    b2_presign_ttl_seconds: int = 900
    b2_object_lock_days: int = 30

    # Provider keys — free path: NVIDIA (+ optional ElevenLabs / LMNT for TTS)
    openai_api_key: str = ""
    replicate_api_token: str = ""
    nvidia_api_key: str = ""
    elevenlabs_api_key: str = ""
    lmnt_api_key: str = ""
    decart_api_key: str = ""
    gmicloud_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "GMI_API_KEY",
            "GMICLOUD_API_KEY",
            "gmi_api_key",
            "gmicloud_api_key",
        ),
    )

    # Preferred vendors (override auto-pick). Empty = auto from available keys.
    # Free path: image/video/tts=nvidia
    image_vendor: str = ""
    video_vendor: str = ""
    tts_vendor: str = ""
    music_vendor: str = ""

    # Models — NVIDIA-friendly defaults from sample free path
    image_model: str = "black-forest-labs/flux.1-schnell"
    video_model: str = "kenburns"
    video_fallback_models: CsvList = Field(default_factory=list)
    # Default edge-tts voice — NVIDIA Magpie probes DEAD on free NIM genai.
    voice_model: str = "en-US-JennyNeural"
    music_model: str = "meta/musicgen"
    # Replicate/GMI music usually 402/404 without credits
    include_music: bool = False

    output_dir: str = "./data/output"
    ffmpeg_path: str = "ffmpeg"
    demo_mode: bool = False

    @property
    def b2_configured(self) -> bool:
        return bool(
            self.b2_key_id and self.b2_application_key and self.b2_bucket_name
        )

    @property
    def gmi_api_key(self) -> str:
        """Alias used by catalog (matches sample naming)."""
        return self.gmicloud_api_key

    @property
    def gmicloud_configured(self) -> bool:
        return bool(self.gmicloud_api_key)

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def replicate_configured(self) -> bool:
        return bool(self.replicate_api_token)

    @property
    def nvidia_configured(self) -> bool:
        return bool(self.nvidia_api_key)

    @property
    def elevenlabs_configured(self) -> bool:
        return bool(self.elevenlabs_api_key)

    @property
    def lmnt_configured(self) -> bool:
        return bool(self.lmnt_api_key)

    @property
    def decart_configured(self) -> bool:
        return bool(self.decart_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
