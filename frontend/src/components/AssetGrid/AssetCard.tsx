import { memo } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Dropdown, Tooltip, Typography } from "antd";
import {
  CheckCircleTwoTone,
  DownloadOutlined,
  EllipsisOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { Asset } from "../../types";
import { MediaPlayer } from "../MediaPlayer/MediaPlayer";
import { AssetKindTag } from "../ui/StatusTag";
import { RelativeTime } from "../ui/RelativeTime";

interface Props {
  asset: Asset;
  selected?: boolean;
  selectable?: boolean;
  onSelectChange?: (assetId: string, selected: boolean) => void;
  onDownload?: (asset: Asset) => void;
  onApprove?: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
  onRemix?: (asset: Asset) => void;
  busy?: boolean;
}

export const AssetCard = memo(function AssetCard({
  asset,
  selected = false,
  selectable = true,
  onSelectChange,
  onDownload,
  onApprove,
  onDelete,
  onRemix,
  busy = false,
}: Props) {
  const menuItems = [
    {
      key: "remix",
      icon: <ExperimentOutlined />,
      label: "Remix from this",
      disabled: !onRemix,
      onClick: () => onRemix?.(asset),
    },
    {
      key: "approve",
      icon: <CheckCircleTwoTone twoToneColor="#16a34a" />,
      label: asset.approved ? "Already approved" : "Approve",
      disabled: !onApprove || !asset.b2_key || !!asset.approved,
      onClick: () => onApprove?.(asset),
    },
    { type: "divider" as const },
    {
      key: "delete",
      danger: true,
      label: "Delete…",
      disabled: !onDelete,
      onClick: () => onDelete?.(asset),
    },
  ];

  return (
    <article
      className={`asset-card${selected ? " asset-card--selected" : ""}`}
      aria-label={`${asset.kind} from step ${asset.step_name}`}
    >
      <div className="asset-card__media">
        <MediaPlayer asset={asset} badge={asset.approved ? "Approved" : undefined} />
        <Link
          to={`/assets/${asset.id}`}
          className="asset-card__open"
          aria-label={`Open ${asset.kind} details`}
        />
        {selectable ? (
          <span className="asset-card__select">
            <Checkbox
              checked={selected}
              aria-label={`Select ${asset.step_name}`}
              onChange={(e) => onSelectChange?.(asset.id, e.target.checked)}
            />
          </span>
        ) : null}
      </div>

      <div className="asset-card__body">
        <div className="row row--wrap" style={{ gap: 6 }}>
          <AssetKindTag kind={asset.kind} />
          <Typography.Text className="asset-card__title grow">
            {asset.step_name}
          </Typography.Text>
        </div>

        <span className="asset-card__meta">
          {asset.provider || "unknown"} · {asset.model || "—"} ·{" "}
          <RelativeTime value={asset.created_at} />
        </span>

        <div className="asset-card__actions">
          <Tooltip title="Provenance & verification">
            <Link to={`/assets/${asset.id}`}>
              <Button size="small" icon={<SafetyCertificateOutlined />}>
                Provenance
              </Button>
            </Link>
          </Tooltip>
          <Tooltip title="Download original">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={busy}
              aria-label="Download"
              onClick={() => onDownload?.(asset)}
            />
          </Tooltip>
          <span className="grow" />
          <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
            <Button size="small" icon={<EllipsisOutlined />} aria-label="More actions" />
          </Dropdown>
        </div>
      </div>
    </article>
  );
});
