from urllib.parse import quote

from app.core.storage import B2Service


class B2AppService:
    """Thin wrapper used by API routes."""

    def __init__(self) -> None:
        self.b2 = B2Service()

    def presign(self, key: str, expires_in: int | None = None) -> tuple[str, int]:
        from app.config import get_settings

        ttl = expires_in or get_settings().b2_presign_ttl_seconds
        return self.b2.presign_get(key, expires_in=ttl), ttl

    def presign_download(
        self, key: str, *, filename: str, expires_in: int | None = None
    ) -> tuple[str, int]:
        """Presign a GET that forces Content-Disposition: attachment."""
        from app.config import get_settings

        ttl = expires_in or get_settings().b2_presign_ttl_seconds
        safe = filename.replace('"', "")
        disposition = f'attachment; filename="{safe}"; filename*=UTF-8\'\'{quote(safe)}'
        url = self.b2.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.b2.bucket,
                "Key": key,
                "ResponseContentDisposition": disposition,
            },
            ExpiresIn=ttl,
        )
        return url, ttl

    def approved_key_for(
        self, source_key: str, campaign_id: str, asset_id: str
    ) -> str:
        from app.config import get_settings

        prefix = get_settings().b2_prefix
        dest = f"{prefix}/campaigns/{campaign_id}/approved/{asset_id}"
        if "." in source_key.rsplit("/", 1)[-1]:
            ext = source_key.rsplit(".", 1)[-1]
            dest = f"{dest}.{ext}"
        return dest

    def approve_copy(self, source_key: str, campaign_id: str, asset_id: str) -> str:
        dest = self.approved_key_for(source_key, campaign_id, asset_id)
        return self.b2.copy_object(source_key, dest)

    def delete_asset_objects(
        self,
        *,
        b2_key: str | None,
        campaign_id: str,
        asset_id: str,
        approved: bool = False,
        thumbnail_b2_key: str | None = None,
    ) -> None:
        """Best-effort removal of B2 objects tied to an asset row."""
        if b2_key:
            self.b2.delete_object(b2_key)
        if approved and b2_key:
            self.b2.delete_object(
                self.approved_key_for(b2_key, campaign_id, asset_id)
            )
        if thumbnail_b2_key:
            self.b2.delete_object(thumbnail_b2_key)
