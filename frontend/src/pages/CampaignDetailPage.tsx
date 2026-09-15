import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, App, Button, Skeleton, Table, Tabs, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { getCampaign, listAssets, listRuns, updateCampaign } from "../services/api";
import type { Asset, Campaign, RunStatus, RunSummary } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { AssetGrid } from "../components/AssetGrid/AssetGrid";
import { RunStatusTag } from "../components/ui/StatusTag";
import { RelativeTime } from "../components/ui/RelativeTime";
import { formatElapsed } from "../utils/time";
import { CampaignForm } from "../components/CampaignForm/CampaignForm";
import type { CampaignFormValues } from "../components/CampaignForm/CampaignForm";
import { EmptyState } from "../components/ui/EmptyState";

export default function CampaignDetailPage() {
  const { campaignId = "" } = useParams();
  const { message } = App.useApp();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveCampaign = async (values: CampaignFormValues) => {
    setSaving(true);
    try {
      setCampaign(
        await updateCampaign(campaignId, {
          ...values,
          brand_colors: (values.brand_colors || []).filter(Boolean),
        }),
      );
      message.success("Campaign updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const loadAssets = useCallback(async () => {
    try {
      setAssets(await listAssets(campaignId));
    } catch {
      /* gallery is non-critical */
    }
  }, [campaignId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      getCampaign(campaignId),
      listRuns({ campaignId, pageSize: 50 }),
      listAssets(campaignId).catch(() => [] as Asset[]),
    ])
      .then(([c, r, a]) => {
        if (!alive) return;
        setCampaign(c);
        setRuns(r.items);
        setAssets(a);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const runColumns: ColumnsType<RunSummary> = [
    {
      title: "Run",
      key: "id",
      render: (_, r) => (
        <Link to={`/runs/${r.id}`} className="mono">
          {r.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 150,
      render: (v: RunStatus) => <RunStatusTag status={v} />,
    },
    {
      title: "Mode",
      dataIndex: "mode",
      width: 100,
      responsive: ["md"],
      render: (v: string) => (v === "full" ? "Full ad" : "Image"),
    },
    {
      title: "Assets",
      dataIndex: "asset_count",
      width: 80,
      align: "right",
      responsive: ["md"],
    },
    {
      title: "Duration",
      key: "duration",
      width: 110,
      responsive: ["lg"],
      render: (_, r) => formatElapsed(r.started_at, r.finished_at) ?? "—",
    },
    {
      title: "Started",
      dataIndex: "created_at",
      width: 150,
      render: (v: string) => <RelativeTime value={v} />,
    },
  ];

  if (loading) {
    return (
      <>
        <PageMeta title="Campaign" />
        <Skeleton active paragraph={{ rows: 8 }} />
      </>
    );
  }

  if (error || !campaign) {
    return (
      <>
        <PageMeta title="Campaign" />
        <Alert
          type="error"
          showIcon
          title="Campaign unavailable"
          description={error || "That campaign no longer exists."}
          action={
            <Link to="/campaigns">
              <Button size="small">All campaigns</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageMeta title={campaign.name} />
      <PageHeader
        eyebrow={
          <>
            <Link to="/campaigns">
              <Button type="text" size="small" icon={<ArrowLeftOutlined />}>
                Campaigns
              </Button>
            </Link>
            <Tag>{campaign.tone}</Tag>
            {campaign.logo_b2_key ? <Tag color="blue">logo attached</Tag> : null}
          </>
        }
        title={campaign.name}
        description={
          <>
            {campaign.product_name}
            {campaign.audience ? ` · for ${campaign.audience}` : ""} · created{" "}
            <RelativeTime value={campaign.created_at} />
          </>
        }
        actions={
          <Link to={`/campaigns/${campaign.id}/generate`}>
            <Button type="primary" icon={<ThunderboltOutlined />}>
              New run
            </Button>
          </Link>
        }
      />

      <Tabs
        defaultActiveKey="runs"
        items={[
          {
            key: "runs",
            label: `Runs (${runs.length})`,
            children: (
              <section className="surface">
                <Table
                  rowKey="id"
                  columns={runColumns}
                  dataSource={runs}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  locale={{
                    emptyText: (
                      <EmptyState
                        icon={<ThunderboltOutlined />}
                        title="No runs yet"
                        description="Generate your first ad pack for this campaign."
                        actions={
                          <Link to={`/campaigns/${campaign.id}/generate`}>
                            <Button type="primary">Start a run</Button>
                          </Link>
                        }
                      />
                    ),
                  }}
                />
              </section>
            ),
          },
          {
            key: "assets",
            label: `Assets (${assets.length})`,
            children: (
              <section className="surface surface--padded">
                <AssetGrid
                  assets={assets}
                  onChanged={() => void loadAssets()}
                  emptyTitle="No assets yet"
                  emptyDescription="Outputs from this campaign's runs will collect here."
                />
              </section>
            ),
          },
          {
            key: "brief",
            label: "Brief & brand kit",
            children: (
              <section className="surface surface--padded">
                <div className="section-head">
                  <div>
                    <h3 className="section-head__title">Campaign brief</h3>
                    <span className="section-head__sub">
                      Changes apply to future runs. Existing runs keep the prompt
                      snapshot they were created with.
                    </span>
                  </div>
                </div>
                <CampaignForm
                  campaign={campaign}
                  submitLabel="Save changes"
                  submitting={saving}
                  onSubmit={saveCampaign}
                />
              </section>
            ),
          },
        ]}
      />
    </>
  );
}
