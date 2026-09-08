import { useCallback, useMemo, useState } from "react";
import { App, Button, Input, Select, Segmented, Typography } from "antd";
import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PictureOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { Asset, AssetKind } from "../../types";
import { approveAsset, deleteAsset } from "../../services/api";
import { downloadAsset } from "../../utils/assetFiles";
import { AssetCard } from "./AssetCard";
import { EmptyState } from "../ui/EmptyState";
import { AssetGridSkeleton } from "../ui/Skeletons";

type SortKey = "newest" | "oldest" | "kind" | "provider";
type FilterKey = "all" | AssetKind;

const KIND_ORDER: Record<string, number> = {
  final: 0,
  video: 1,
  audio: 2,
  image: 3,
  manifest: 4,
  other: 5,
};

interface Props {
  assets: Asset[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onChanged?: () => void;
  onRemix?: (asset: Asset) => void;
  /** Hides the search/sort toolbar for embedded, already-scoped listings. */
  compact?: boolean;
}

export function AssetGrid({
  assets,
  loading = false,
  emptyTitle = "No assets yet",
  emptyDescription = "Generated images, video, and voiceover will appear here.",
  emptyAction,
  onChanged,
  onRemix,
  compact = false,
}: Props) {
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = assets.filter((a) => {
      if (filter !== "all" && a.kind !== filter) return false;
      if (!needle) return true;
      return (
        a.step_name.toLowerCase().includes(needle) ||
        a.provider.toLowerCase().includes(needle) ||
        a.model.toLowerCase().includes(needle) ||
        a.id.toLowerCase().includes(needle)
      );
    });

    return [...base].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "kind":
          return (
            (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
            b.created_at.localeCompare(a.created_at)
          );
        case "provider":
          return (
            a.provider.localeCompare(b.provider) ||
            b.created_at.localeCompare(a.created_at)
          );
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [assets, filter, query, sort]);

  const toggleSelect = useCallback((id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  const handleDownload = async (asset: Asset) => {
    setBusyId(asset.id);
    try {
      await downloadAsset(asset);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (asset: Asset) => {
    setBusyId(asset.id);
    try {
      await approveAsset(asset.id);
      message.success("Approved and archived to the approved/ prefix");
      onChanged?.();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (asset: Asset) => {
    modal.confirm({
      title: "Delete this asset?",
      content:
        "The gallery entry and the stored object are both removed. This cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        await deleteAsset(asset.id);
        message.success("Asset deleted");
        toggleSelect(asset.id, false);
        onChanged?.();
      },
    });
  };

  const selectedAssets = visible.filter((a) => selected.has(a.id));

  const bulkDownload = async () => {
    setBulkBusy(true);
    try {
      for (const asset of selectedAssets) {
        await downloadAsset(asset);
      }
      message.success(`Downloaded ${selectedAssets.length} assets`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkApprove = async () => {
    setBulkBusy(true);
    try {
      const targets = selectedAssets.filter((a) => a.b2_key && !a.approved);
      await Promise.all(targets.map((a) => approveAsset(a.id)));
      message.success(`Approved ${targets.length} assets`);
      clearSelection();
      onChanged?.();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = () => {
    modal.confirm({
      title: `Delete ${selectedAssets.length} assets?`,
      content: "Every selected object is removed from storage. This cannot be undone.",
      okText: `Delete ${selectedAssets.length}`,
      okButtonProps: { danger: true },
      onOk: async () => {
        setBulkBusy(true);
        try {
          await Promise.all(selectedAssets.map((a) => deleteAsset(a.id)));
          message.success(`Deleted ${selectedAssets.length} assets`);
          clearSelection();
          onChanged?.();
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  if (loading && assets.length === 0) return <AssetGridSkeleton />;

  return (
    <div className="stack">
      {!compact ? (
        <div className="toolbar">
          <div className="toolbar__group">
            <Input
              allowClear
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              prefix={<SearchOutlined />}
              placeholder="Search step, provider, model…"
              style={{ width: 260 }}
              aria-label="Search assets"
            />
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v as FilterKey)}
              options={[
                { label: "All", value: "all" },
                { label: "Final", value: "final" },
                { label: "Video", value: "video" },
                { label: "Image", value: "image" },
                { label: "Audio", value: "audio" },
              ]}
            />
          </div>
          <div className="toolbar__group">
            <Typography.Text type="secondary" style={{ fontSize: "var(--text-sm)" }}>
              {visible.length} of {assets.length}
            </Typography.Text>
            <Select
              value={sort}
              onChange={setSort}
              style={{ width: 150 }}
              aria-label="Sort assets"
              options={[
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
                { value: "kind", label: "By type" },
                { value: "provider", label: "By provider" },
              ]}
            />
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<PictureOutlined />}
          title={query || filter !== "all" ? "No matching assets" : emptyTitle}
          description={
            query || filter !== "all"
              ? "Try a different search term or clear the type filter."
              : emptyDescription
          }
          actions={
            query || filter !== "all" ? (
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              emptyAction
            )
          }
        />
      ) : (
        <div className="asset-grid">
          {visible.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              busy={busyId === asset.id}
              selected={selected.has(asset.id)}
              onSelectChange={toggleSelect}
              onDownload={(a) => void handleDownload(a)}
              onApprove={(a) => void handleApprove(a)}
              onDelete={handleDelete}
              onRemix={onRemix}
            />
          ))}
        </div>
      )}

      {selectedAssets.length > 0 ? (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span className="bulk-bar__count">
            {selectedAssets.length} selected
          </span>
          <div className="row">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={bulkBusy}
              onClick={() => void bulkDownload()}
            >
              Download
            </Button>
            <Button
              size="small"
              icon={<CheckOutlined />}
              loading={bulkBusy}
              onClick={() => void bulkApprove()}
            >
              Approve
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={bulkBusy}
              onClick={bulkDelete}
            >
              Delete
            </Button>
            <Button size="small" type="text" onClick={clearSelection} style={{ color: "inherit" }}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
