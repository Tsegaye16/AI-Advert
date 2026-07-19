from __future__ import annotations

import hashlib
import logging
import mimetypes
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote, urlparse

import boto3
from botocore.client import Config

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_WINDOWS_FILE_URL_PATCHED = False


def _patch_genblaze_windows_file_urls() -> None:
    """Genblaze parses ``file:///C:/...`` as ``/C:/...`` then ``Path.resolve()``
    collapses to ``C:Users\\...`` on Windows (drive-relative), failing the
    temp-dir allowlist. Normalize the drive letter before resolve.
    """
    global _WINDOWS_FILE_URL_PATCHED
    if _WINDOWS_FILE_URL_PATCHED or os.name != "nt":
        return
    try:
        from genblaze_core.exceptions import StorageError
        from genblaze_core.storage import transfer as transfer_mod
        from genblaze_core._utils import ALLOWED_FILE_ROOTS
    except ImportError:
        return

    def _read_local_file_win(
        url: str, *, extra_roots: list[Path] | None = None
    ) -> tuple[bytes, str | None]:
        parsed = urlparse(url)
        path = unquote(parsed.path)
        # file:///C:/Users/... → path="/C:/Users/..." → strip leading slash
        if len(path) >= 3 and path[0] == "/" and path[2] == ":":
            path = path[1:]
        resolved = Path(path).resolve()

        allowed = list(ALLOWED_FILE_ROOTS)
        if extra_roots:
            allowed.extend(r.resolve() for r in extra_roots)

        if not any(resolved.is_relative_to(root) for root in allowed):
            raise StorageError(
                f"Access denied: local file path {resolved} is outside allowed "
                f"directories. Files must be under temp or output_dir."
            )
        try:
            data = resolved.read_bytes()
        except Exception as exc:
            raise StorageError(f"Failed to read local file {path}: {exc}") from exc
        content_type, _ = mimetypes.guess_type(str(resolved))
        return data, content_type

    transfer_mod._read_local_file = _read_local_file_win  # type: ignore[attr-defined]
    _WINDOWS_FILE_URL_PATCHED = True
    logger.info("Patched Genblaze Windows file:// path handling for B2 transfers")


def _configure_b2_env(settings: Settings) -> None:
    """Genblaze B2 backend reads standard B2 env vars."""
    if settings.b2_key_id:
        os.environ.setdefault("B2_KEY_ID", settings.b2_key_id)
    if settings.b2_application_key:
        os.environ.setdefault("B2_APPLICATION_KEY", settings.b2_application_key)
        os.environ.setdefault("B2_APP_KEY", settings.b2_application_key)


@lru_cache
def get_s3_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.b2_endpoint,
        aws_access_key_id=settings.b2_key_id,
        aws_secret_access_key=settings.b2_application_key,
        region_name=settings.b2_region,
        config=Config(signature_version="s3v4"),
    )


def build_object_storage_sink(settings: Settings | None = None):
    """Create Genblaze ObjectStorageSink bound to Backblaze B2.

    Mirrors the official sample: pass explicit key_id/app_key (do not rely only
    on env fallbacks inside genblaze-s3).
    """
    from genblaze_core import KeyStrategy, ObjectStorageSink
    from genblaze_s3 import S3StorageBackend

    settings = settings or get_settings()
    if not settings.b2_configured:
        raise RuntimeError(
            "Backblaze B2 is not configured. Set B2_KEY_ID, B2_APPLICATION_KEY, "
            "and B2_BUCKET_NAME."
        )

    _patch_genblaze_windows_file_urls()
    _configure_b2_env(settings)

    kwargs: dict[str, Any] = {
        "region": settings.b2_region,
        "key_id": settings.b2_key_id,
        "app_key": settings.b2_application_key,
        "auto_lifecycle": True,
    }
    if settings.b2_public_url_base:
        kwargs["public_url_base"] = settings.b2_public_url_base

    backend = S3StorageBackend.for_backblaze(settings.b2_bucket_name, **kwargs)
    return ObjectStorageSink(
        backend,
        prefix=settings.b2_prefix,
        key_strategy=KeyStrategy.HIERARCHICAL,
    )


class B2Service:
    """Direct B2 helpers for list/get/presign/object-lock outside Genblaze sink."""

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.bucket = self.settings.b2_bucket_name
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not self.settings.b2_configured:
                raise RuntimeError("Backblaze B2 is not configured.")
            self._client = get_s3_client()
        return self._client

    def key_from_url(self, url: str | None) -> Optional[str]:
        if not url:
            return None
        parsed = urlparse(url)
        path = parsed.path.lstrip("/")
        # Public B2 URLs look like /file/<bucket>/<key>
        marker = f"file/{self.bucket}/"
        if marker in path:
            return path.split(marker, 1)[1]
        if path.startswith(f"{self.bucket}/"):
            return path[len(self.bucket) + 1 :]
        # Genblaze may already use s3-style URLs: https://endpoint/bucket/key
        if path.startswith(self.bucket + "/"):
            return path[len(self.bucket) + 1 :]
        return path or None

    def presign_get(self, key: str, expires_in: int | None = None) -> str:
        ttl = expires_in or self.settings.b2_presign_ttl_seconds
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=ttl,
        )

    def get_bytes(self, key: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    def put_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: dict[str, str] | None = None,
    ) -> str:
        extra: dict[str, Any] = {"ContentType": content_type}
        if metadata:
            extra["Metadata"] = metadata
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
        return key

    def copy_object(self, source_key: str, dest_key: str) -> str:
        self.client.copy_object(
            Bucket=self.bucket,
            CopySource={"Bucket": self.bucket, "Key": source_key},
            Key=dest_key,
        )
        return dest_key

    def delete_object(self, key: str, *, ignore_missing: bool = True) -> None:
        """Remove an object from B2. Best-effort when ``ignore_missing`` is true."""
        from botocore.exceptions import ClientError

        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if ignore_missing and code in {"404", "NoSuchKey", "NotFound"}:
                return
            raise

    def apply_object_lock(self, key: str, days: int | None = None) -> None:
        """Best-effort Object Lock retention for compliance story."""
        retain_days = days if days is not None else self.settings.b2_object_lock_days
        if retain_days <= 0:
            return
        retain_until = datetime.now(timezone.utc) + timedelta(days=retain_days)
        try:
            self.client.put_object_retention(
                Bucket=self.bucket,
                Key=key,
                Retention={
                    "Mode": "GOVERNANCE",
                    "RetainUntilDate": retain_until,
                },
            )
            logger.info("Applied Object Lock to %s until %s", key, retain_until)
        except Exception as exc:  # noqa: BLE001
            # Bucket may not have Object Lock enabled — do not fail the run.
            logger.warning("Object Lock not applied for %s: %s", key, exc)

    @staticmethod
    def sha256_bytes(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    def verify_object_hash(self, key: str, expected_sha256: str) -> tuple[bool, str]:
        data = self.get_bytes(key)
        actual = self.sha256_bytes(data)
        return actual == expected_sha256.lower(), actual

    def probe_connection(self) -> bool:
        """Return True when the configured bucket is reachable."""
        if not self.settings.b2_configured:
            return False
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.debug("B2 health probe failed: %s", exc)
            return False
