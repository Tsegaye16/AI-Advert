import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Tag, Typography } from "antd";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  PlusOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { listAllAssets, listRuns } from "../services/api";
import type { Asset, RunSummary } from "../types";
import { useCampaigns } from "../hooks/useCampaigns";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { EmptyState } from "../components/ui/EmptyState";
import { RunStatusTag } from "../components/ui/StatusTag";
import { RelativeTime } from "../components/ui/RelativeTime";
import { AssetGridSkeleton, StatSkeleton } from "../components/ui/Skeletons";
import { AssetCard } from "../components/AssetGrid/AssetCard";

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="surface stat">
      <span className="stat__label">
        {icon}
        {label}
      </span>
      <div className="stat__value">{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

export default function OverviewPage() {
  const { campaigns, loading: campaignsLoading } = useCampaigns();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetTotal, setAssetTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([listRuns({ pageSize: 6 }), listAllAssets({ pageSize: 8 })])
      .then(([r, a]) => {
        if (!alive) return;
        setRuns(r.items);
        setAssets(a.items);
        setAssetTotal(a.total);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const active = useMemo(
    () => runs.filter((r) => r.status === "running" || r.status === "queued"),
    [runs],
  );
  const needsReview = useMemo(
    () => runs.filter((r) => r.status === "storyboard"),
    [runs],
  );

  const isEmpty = !campaignsLoading && !loading && campaigns.length === 0;

  if (isEmpty) {
    return (
      <>
        <PageMeta title="Overview" />
        <PageHeader title="Welcome to AdVault" />
        <section className="surface">
          <EmptyState
            icon={<RocketOutlined />}
            title="Create your first campaign"
            description="A campaign captures the product, audience, tone, and brand kit. Every generation run inherits it, and every artifact it produces gets a signed provenance record."
            actions={
              <Link to="/campaigns/new">
                <Button type="primary" size="large" icon={<PlusOutlined />}>
                  New campaign
                </Button>
              </Link>
            }
          />
        </section>
      </>
    );
  }

  return (
    <>
      <PageMeta title="Overview" />
      <PageHeader
        title="Overview"
        description="Current pipeline activity and the most recent creative across all campaigns."
        actions={
          <Link to="/campaigns/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New campaign
            </Button>
          </Link>
        }
      />

      {error ? (
        <Alert type="error" showIcon title="Could not load dashboard" description={error} />
      ) : null}

      {needsReview.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={`${needsReview.length} storyboard${needsReview.length > 1 ? "s" : ""} waiting for review`}
          description="Scenes are rendered and ready for you to approve before the video is built."
          action={
            <Link to={`/runs/${needsReview[0].id}`}>
              <Button size="small" type="primary">
                Review now
              </Button>
            </Link>
          }
        />
      ) : null}

      {loading ? (
        <StatSkeleton />
      ) : (
        <div className="stat-grid">
          <Stat
            icon={<FolderOpenOutlined />}
            label="Campaigns"
            value={campaigns.length}
            hint="Briefs available to generate from"
          />
          <Stat
            icon={<ThunderboltOutlined />}
            label="Active runs"
            value={active.length}
            hint={active.length ? "Pipelines executing now" : "Nothing running"}
          />
          <Stat
            icon={<PictureOutlined />}
            label="Assets"
            value={assetTotal}
            hint="Stored on Backblaze B2"
          />
          <Stat
            icon={<SafetyCertificateOutlined />}
            label="Verifiable"
            value={runs.filter((r) => r.canonical_hash).length}
            hint="Runs with a signed manifest"
          />
        </div>
      )}

      <section className="surface surface--padded">
        <div className="section-head">
          <div>
            <h3 className="section-head__title">Recent runs</h3>
            <span className="section-head__sub">The last few generation passes.</span>
          </div>
          <Link to="/runs">
            <Button type="text" size="small">
              All runs <ArrowRightOutlined />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="stack stack--sm">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8 }} />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<ThunderboltOutlined />}
            title="No runs yet"
            description="Start a generation from one of your campaigns."
            actions={
              <Link to="/campaigns">
                <Button type="primary">Choose a campaign</Button>
              </Link>
            }
          />
        ) : (
          <div className="stack stack--sm">
            {runs.map((run) => (
              <Link key={run.id} to={`/runs/${run.id}`} className="lineage-node">
                <RunStatusTag status={run.status} />
                <div className="grow">
                  <Typography.Text strong>
                    {run.campaign_name || "Untitled campaign"}
                  </Typography.Text>
                  <div className="subtle" style={{ fontSize: "var(--text-xs)" }}>
                    <span className="mono">{run.id.slice(0, 8)}</span> ·{" "}
                    {run.mode === "full" ? "Full ad" : "Hero image"} · {run.asset_count}{" "}
                    assets
                  </div>
                </div>
                {run.canonical_hash ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">
                    signed
                  </Tag>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: "var(--text-sm)" }}>
                  <RelativeTime value={run.created_at} />
                </Typography.Text>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="surface surface--padded">
        <div className="section-head">
          <div>
            <h3 className="section-head__title">Latest assets</h3>
            <span className="section-head__sub">
              Newest creative across every campaign.
            </span>
          </div>
          <Link to="/assets">
            <Button type="text" size="small">
              All assets <ArrowRightOutlined />
            </Button>
          </Link>
        </div>

        {loading ? (
          <AssetGridSkeleton count={4} />
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<PictureOutlined />}
            title="No assets yet"
            description="Generated creative will appear here as soon as a run completes."
          />
        ) : (
          <div className="asset-grid">
            {assets.slice(0, 8).map((asset) => (
              <AssetCard key={asset.id} asset={asset} selectable={false} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
