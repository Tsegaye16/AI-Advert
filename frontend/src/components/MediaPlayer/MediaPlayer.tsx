import { useEffect, useState } from "react";
import { Typography } from "antd";
import {
  AudioOutlined,
  FileUnknownOutlined,
  PictureOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { Asset } from "../../types";
import { useAssetUrl } from "../../hooks/useAssetUrl";
import { aspectFor, mediaKindOf } from "../../utils/media";
import { formatDuration } from "../../utils/time";

interface Props {
  asset: Asset;
  /** Interactive players are only worth rendering when the item is focused. */
  controls?: boolean;
  cover?: boolean;
  badge?: string;
  className?: string;
}

export function MediaPlayer({
  asset,
  controls = false,
  cover = false,
  badge,
  className,
}: Props) {
  const kind = mediaKindOf(asset);
  const { url, loading } = useAssetUrl(asset);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  const duration = formatDuration(asset.duration_ms);
  const frameStyle = { "--media-aspect": aspectFor(asset, kind) } as React.CSSProperties;
  const classes = [
    "media-frame",
    cover ? "media-frame--cover" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  if (kind === "audio") {
    return (
      <div className={classes} style={frameStyle}>
        <div className="media-audio">
          <Typography.Text className="subtle" style={{ fontSize: "var(--text-xs)" }}>
            <AudioOutlined /> {asset.step_name || "Audio"}
          </Typography.Text>
          {url ? (
            <audio src={url} controls preload="none" aria-label={`Audio: ${asset.step_name}`} />
          ) : (
            <div className="skeleton skeleton-text" style={{ height: 34 }} />
          )}
        </div>
      </div>
    );
  }

  if (loading && !url) {
    return <div className={`${classes} skeleton`} style={frameStyle} aria-busy="true" />;
  }

  if (!url || failed) {
    return (
      <div className={classes} style={frameStyle}>
        <div className="media-frame__placeholder">
          {kind === "video" ? (
            <VideoCameraOutlined />
          ) : kind === "image" ? (
            <PictureOutlined />
          ) : (
            <FileUnknownOutlined />
          )}
          <span>{failed ? "Preview unavailable" : "No preview"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={classes} style={frameStyle}>
      {kind === "video" ? (
        <video
          src={url}
          controls={controls}
          playsInline
          muted={!controls}
          preload="metadata"
          onError={() => setFailed(true)}
          aria-label={`Video: ${asset.step_name}`}
        />
      ) : (
        <img
          src={url}
          alt={asset.step_name ? `${asset.kind} — ${asset.step_name}` : asset.kind}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      {badge ? <span className="media-badge">{badge}</span> : null}
      {duration ? <span className="media-duration">{duration}</span> : null}
    </div>
  );
}
