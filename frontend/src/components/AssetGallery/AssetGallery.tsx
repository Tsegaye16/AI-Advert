import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  approveAsset,
  deleteAsset,
  downloadAssetBlob,
  getAssetUrl,
  pollRun,
  remixRun,
} from "../../services/api";
import type { Asset, AssetKind, Run } from "../../types";
import { ProvenanceViewer } from "../ProvenanceViewer/ProvenanceViewer";
import { RunStatus } from "../RunStatus/RunStatus";

type FilterKey = "all" | "final" | "image" | "video" | "audio";

interface Props {
  assets: Asset[];
  loading?: boolean;
  error?: string | null;
  total?: number;
  page?: number;
  pageSize?: number;
  filterLabel?: string;
  onPageChange?: (page: number) => void;
  onRemixed?: (run: Run) => void;
  onChanged?: () => void;
}

function useViewUrl(asset: Asset): string | null {
  const [viewUrl, setViewUrl] = useState<string | null>(asset.url);

  useEffect(() => {
    let cancelled = false;
    if (!asset.b2_key) {
      setViewUrl(asset.url);
      return;
    }
    void getAssetUrl(asset.id)
      .then(({ url }) => {
        if (!cancelled) setViewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setViewUrl(asset.url);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.b2_key, asset.url]);

  return viewUrl;
}

function AssetMedia({ asset }: { asset: Asset }) {
  const viewUrl = useViewUrl(asset);

  if (asset.mime.startsWith("video/") || asset.kind === "final" || asset.kind === "video") {
    return (
      <video
        src={viewUrl || undefined}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  if (asset.mime.startsWith("audio/") || asset.kind === "audio") {
    return (
      <div className="asset-audio-wrap">
        {viewUrl ? <audio src={viewUrl} controls preload="metadata" /> : null}
      </div>
    );
  }
  if (asset.mime.startsWith("image/") && viewUrl) {
    return <img src={viewUrl} alt={asset.step_name} />;
  }
  return (
    <Typography.Text type="secondary">{asset.kind.toUpperCase()}</Typography.Text>
  );
}

const KIND_ORDER: Record<string, number> = {
  final: 0,
  video: 1,
  audio: 2,
  image: 3,
  other: 4,
};

const KIND_COLORS: Record<string, string> = {
  final: "green",
  video: "purple",
  audio: "geekblue",
  image: "cyan",
  other: "default",
};

function kindLabel(asset: Asset): string {
  if (asset.kind === "final") return "final + VO";
  if (asset.kind === "video") return "B-roll (silent)";
  return asset.kind;
}

function filenameForAsset(asset: Asset): string {
  const mime = (asset.mime || "").split(";")[0].trim();
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp3": ".mp3",
  };
  const ext = map[mime] || "";
  return `advault-${asset.step_name || asset.kind}-${asset.id.slice(0, 8)}${ext}`;
}

export function AssetGallery({
  assets,
  loading,
  error,
  total = 0,
  page = 1,
  pageSize = 12,
  filterLabel,
  onPageChange,
  onRemixed,
  onChanged,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [remixOpen, setRemixOpen] = useState(false);
  const [remixPrompt, setRemixPrompt] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remixRunState, setRemixRunState] = useState<Run | null>(null);
  const [remixPolling, setRemixPolling] = useState(false);

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? assets
        : assets.filter((a) => a.kind === (filter as AssetKind));
    return [...base].sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
        b.created_at.localeCompare(a.created_at),
    );
  }, [assets, filter]);

  const openDownload = async (asset: Asset) => {
    setBusyId(asset.id);
    try {
      const blob = await downloadAssetBlob(asset.id);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filenameForAsset(asset);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      message.success("Download started");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = async (asset: Asset) => {
    setBusyId(asset.id);
    try {
      await approveAsset(asset.id);
      message.success("Approved — copied to approved/ on B2 (original key retained)");
      onChanged?.();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (asset: Asset) => {
    setBusyId(asset.id);
    try {
      await deleteAsset(asset.id);
      message.success("Asset deleted");
      if (selected?.id === asset.id) {
        setSelected(null);
        setProvenanceOpen(false);
      }
      onChanged?.();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const onRemix = async () => {
    if (!selected) return;
    setBusyId(selected.id);
    setRemixPolling(true);
    try {
      const run = await remixRun(selected.run_id, {
        prompt_override: remixPrompt,
      });
      setRemixRunState(run);
      onRemixed?.(run);
      message.success("Remix started — polling pipeline…");

      const finalRun = await pollRun(run.id, (tick) => {
        setRemixRunState(tick);
        onRemixed?.(tick);
      });

      if (finalRun.status === "succeeded") {
        message.success("Remix complete");
        onChanged?.();
        setRemixOpen(false);
      } else {
        message.error(finalRun.error || "Remix failed");
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Remix failed");
    } finally {
      setBusyId(null);
      setRemixPolling(false);
    }
  };

  const hasMore = total > page * pageSize;
  const showEmpty = !loading && filtered.length === 0 && !error;

  return (
    <div className="panel asset-gallery-panel">
      <div className="gallery-toolbar">
        <div>
          <h2 className="panel-title" style={{ margin: 0 }}>
            Asset gallery
          </h2>
          {filterLabel ? (
            <Typography.Text type="secondary" style={{ fontSize: "0.85rem" }}>
              {filterLabel}
            </Typography.Text>
          ) : null}
        </div>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          options={[
            { label: "All", value: "all" },
            { label: "Final", value: "final" },
            { label: "Image", value: "image" },
            { label: "Video", value: "video" },
            { label: "Audio", value: "audio" },
          ]}
        />
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="Could not refresh assets"
          description={error}
        />
      ) : null}

      <Spin spinning={!!loading} tip="Refreshing…">
        {showEmpty ? (
          <Empty description="Generate a campaign to populate the gallery" />
        ) : (
          <div className="asset-grid">
            {filtered.map((asset) => (
              <article
                key={asset.id}
                className={`asset-tile${asset.kind === "final" ? " final-tile" : ""}`}
              >
                <div className="asset-media">
                  <AssetMedia asset={asset} />
                </div>
                <div className="asset-body">
                  <Space wrap size={[4, 4]}>
                    <Tag
                      className="kind-tag"
                      color={KIND_COLORS[asset.kind] || "default"}
                    >
                      {kindLabel(asset)}
                    </Tag>
                    <Tag color="blue">{asset.step_name}</Tag>
                    {asset.approved ? <Tag color="green">approved</Tag> : null}
                  </Space>
                  <Typography.Text className="muted">
                    {asset.provider || "—"} / {asset.model || "—"}
                  </Typography.Text>
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => {
                        setSelected(asset);
                        setProvenanceOpen(true);
                      }}
                    >
                      Provenance
                    </Button>
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      loading={busyId === asset.id}
                      onClick={() => void openDownload(asset)}
                    >
                      Download
                    </Button>
                    <Button
                      size="small"
                      icon={<ExperimentOutlined />}
                      onClick={() => {
                        setSelected(asset);
                        setRemixPrompt("");
                        setRemixRunState(null);
                        setRemixOpen(true);
                      }}
                    >
                      Remix
                    </Button>
                    <Button
                      size="small"
                      icon={<CheckOutlined />}
                      disabled={!asset.b2_key || !!asset.approved}
                      loading={busyId === asset.id}
                      onClick={() => void onApprove(asset)}
                    >
                      {asset.approved ? "Approved" : "Approve"}
                    </Button>
                    <Popconfirm
                      title="Delete this asset?"
                      description="Removes the gallery entry and deletes the file from storage. This cannot be undone."
                      okText="Delete"
                      okType="danger"
                      cancelText="Cancel"
                      onConfirm={() => void onDelete(asset)}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={busyId === asset.id}
                      >
                        Delete
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
              </article>
            ))}
          </div>
        )}
      </Spin>

      {(hasMore || page > 1) && (
        <div className="gallery-load-more">
          <Typography.Text type="secondary">
            Showing {Math.min(page * pageSize, total)} of {total}
          </Typography.Text>
          <Space>
            <Button
              disabled={page <= 1 || !!loading}
              onClick={() => onPageChange?.(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="primary"
              disabled={!hasMore || !!loading}
              onClick={() => onPageChange?.(page + 1)}
            >
              Load more
            </Button>
          </Space>
        </div>
      )}

      <ProvenanceViewer
        asset={selected}
        open={provenanceOpen}
        onClose={() => setProvenanceOpen(false)}
      />

      <Modal
        title="Remix creative"
        open={remixOpen}
        onCancel={() => {
          if (!remixPolling) setRemixOpen(false);
        }}
        onOk={() => void onRemix()}
        okText={remixPolling ? "Running…" : "Start remix"}
        okButtonProps={{
          disabled: !remixPrompt.trim() || remixPolling,
          loading: remixPolling,
        }}
        cancelButtonProps={{ disabled: remixPolling }}
        width={640}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Starts a new Genblaze run linked via parent_run_id for lineage.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={remixPrompt}
          disabled={remixPolling}
          onChange={(e) => setRemixPrompt(e.target.value)}
          placeholder="Describe the remix — e.g. warmer lighting, lifestyle setting"
        />
        {remixRunState ? (
          <div style={{ marginTop: 16 }}>
            <RunStatus run={remixRunState} compact />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
