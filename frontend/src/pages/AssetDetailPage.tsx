import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, App, Button, Descriptions, Skeleton, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { approveAsset, deleteAsset, getAsset } from "../services/api";
import type { Asset } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { MediaPlayer } from "../components/MediaPlayer/MediaPlayer";
import { formatDuration } from "../utils/time";
import { ProvenancePanel } from "../components/Provenance/ProvenancePanel";
import { AssetKindTag } from "../components/ui/StatusTag";
import { RelativeTime } from "../components/ui/RelativeTime";
import { CopyableHash } from "../components/ui/CopyableHash";
import { downloadAsset } from "../utils/assetFiles";

export default function AssetDetailPage() {
  const { assetId = "" } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getAsset(assetId)
      .then((data) => alive && setAsset(data))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [assetId]);

  const download = async () => {
    if (!asset) return;
    setBusy(true);
    try {
      await downloadAsset(asset);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!asset) return;
    setBusy(true);
    try {
      setAsset(await approveAsset(asset.id));
      message.success("Approved and archived");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!asset) return;
    modal.confirm({
      title: "Delete this asset?",
      content: "The stored object and its gallery entry are removed permanently.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteAsset(asset.id);
        message.success("Asset deleted");
        navigate("/assets");
      },
    });
  };

  if (loading) {
    return (
      <>
        <PageMeta title="Asset" />
        <Skeleton active paragraph={{ rows: 8 }} />
      </>
    );
  }

  if (error || !asset) {
    return (
      <>
        <PageMeta title="Asset" />
        <Alert
          type="error"
          showIcon
          title="Asset unavailable"
          description={error || "That asset no longer exists."}
          action={
            <Link to="/assets">
              <Button size="small">All assets</Button>
            </Link>
          }
        />
      </>
    );
  }

  const dimensions =
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;

  return (
    <>
      <PageMeta title={`${asset.step_name} — asset`} />
      <PageHeader
        eyebrow={
          <>
            <Link to="/assets">
              <Button type="text" size="small" icon={<ArrowLeftOutlined />}>
                Assets
              </Button>
            </Link>
            <AssetKindTag kind={asset.kind} />
            {asset.approved ? <Tag color="success">approved</Tag> : null}
          </>
        }
        title={asset.step_name || asset.kind}
        description={
          <>
            Produced by {asset.provider || "an unknown provider"}
            {asset.model ? ` using ${asset.model}` : ""} ·{" "}
            <RelativeTime value={asset.created_at} /> ·{" "}
            <Link to={`/runs/${asset.run_id}`}>View run</Link>
          </>
        }
        actions={
          <>
            <Button
              icon={<DownloadOutlined />}
              loading={busy}
              onClick={() => void download()}
            >
              Download
            </Button>
            <Button
              icon={<CheckOutlined />}
              loading={busy}
              disabled={!asset.b2_key || !!asset.approved}
              onClick={() => void approve()}
            >
              {asset.approved ? "Approved" : "Approve"}
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={remove}>
              Delete
            </Button>
          </>
        }
      />

      <section className="surface" style={{ overflow: "hidden" }}>
        <MediaPlayer asset={asset} controls />
      </section>

      <section className="surface surface--padded">
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, md: 2 }}
          items={[
            { key: "type", label: "Media type", children: asset.mime || "—" },
            {
              key: "dims",
              label: "Dimensions",
              children: dimensions || <span className="subtle">—</span>,
            },
            {
              key: "duration",
              label: "Duration",
              children: formatDuration(asset.duration_ms) || <span className="subtle">—</span>,
            },
            {
              key: "created",
              label: "Created",
              children: <RelativeTime value={asset.created_at} />,
            },
            {
              key: "key",
              label: "Storage key",
              span: 2,
              children: <CopyableHash value={asset.b2_key} head={44} tail={14} label="storage key" />,
            },
          ]}
        />
      </section>

      <section className="surface surface--padded">
        <ProvenancePanel asset={asset} />
      </section>
    </>
  );
}
