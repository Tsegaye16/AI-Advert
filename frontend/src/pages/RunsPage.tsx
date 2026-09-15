import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Select, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ThunderboltOutlined } from "@ant-design/icons";
import { listRuns } from "../services/api";
import type { RunStatus, RunSummary } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { EmptyState } from "../components/ui/EmptyState";
import { RunStatusTag } from "../components/ui/StatusTag";
import { RelativeTime } from "../components/ui/RelativeTime";
import { formatElapsed } from "../utils/time";
import { useCampaigns } from "../hooks/useCampaigns";

const PAGE_SIZE = 20;

export default function RunsPage() {
  const [params, setParams] = useSearchParams();
  const { campaigns } = useCampaigns();

  const campaignId = params.get("campaign") || undefined;
  const status = (params.get("status") as RunStatus | null) || undefined;
  const page = Number(params.get("page") || 1);

  const [rows, setRows] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRuns({
        page,
        pageSize: PAGE_SIZE,
        campaignId,
        status,
      });
      setRows(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load runs");
    } finally {
      setLoading(false);
    }
  }, [page, campaignId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const columns: ColumnsType<RunSummary> = useMemo(
    () => [
      {
        title: "Run",
        key: "run",
        render: (_, record) => (
          <div>
            <Link to={`/runs/${record.id}`}>
              <Typography.Text strong className="mono">
                {record.id.slice(0, 8)}
              </Typography.Text>
            </Link>
            <div className="subtle" style={{ fontSize: "var(--text-xs)" }}>
              {record.campaign_name || "Unknown campaign"}
            </div>
          </div>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        width: 150,
        render: (value: RunStatus) => <RunStatusTag status={value} />,
      },
      {
        title: "Mode",
        dataIndex: "mode",
        width: 100,
        responsive: ["md"],
        render: (value: string) => (
          <Typography.Text type="secondary">
            {value === "full" ? "Full ad" : "Image"}
          </Typography.Text>
        ),
      },
      {
        title: "Assets",
        dataIndex: "asset_count",
        width: 90,
        align: "right",
        responsive: ["md"],
        render: (value: number) => <span className="mono">{value}</span>,
      },
      {
        title: "Duration",
        key: "duration",
        width: 110,
        responsive: ["lg"],
        render: (_, record) =>
          formatElapsed(record.started_at, record.finished_at) ?? (
            <span className="subtle">—</span>
          ),
      },
      {
        title: "Started",
        dataIndex: "created_at",
        width: 150,
        render: (value: string) => <RelativeTime value={value} />,
      },
    ],
    [],
  );

  return (
    <>
      <PageMeta title="Runs" />
      <PageHeader
        title="Runs"
        description="Every generation pass, newest first. Open a run to watch its pipeline or review its storyboard."
      />

      {error ? (
        <Alert type="error" showIcon title="Could not load runs" description={error} />
      ) : null}

      <section className="surface">
        <div className="toolbar" style={{ padding: "var(--space-4) var(--space-4) 0" }}>
          <div className="toolbar__group">
            <Select
              allowClear
              placeholder="All campaigns"
              value={campaignId}
              style={{ minWidth: 220 }}
              aria-label="Filter by campaign"
              onChange={(v) => setParam("campaign", v)}
              options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              allowClear
              placeholder="Any status"
              value={status}
              style={{ minWidth: 160 }}
              aria-label="Filter by status"
              onChange={(v) => setParam("status", v)}
              options={[
                { value: "queued", label: "Queued" },
                { value: "running", label: "Running" },
                { value: "storyboard", label: "Needs review" },
                { value: "succeeded", label: "Complete" },
                { value: "failed", label: "Failed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            hideOnSinglePage: true,
            onChange: (next) => setParam("page", String(next)),
          }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ThunderboltOutlined />}
                title={campaignId || status ? "No runs match these filters" : "No runs yet"}
                description={
                  campaignId || status
                    ? "Try clearing the campaign or status filter."
                    : "Start a generation run from any campaign to see it here."
                }
                actions={
                  campaignId || status ? (
                    <Button onClick={() => setParams(new URLSearchParams())}>
                      Clear filters
                    </Button>
                  ) : (
                    <Link to="/campaigns">
                      <Button type="primary">Go to campaigns</Button>
                    </Link>
                  )
                }
              />
            ),
          }}
        />
      </section>
    </>
  );
}
