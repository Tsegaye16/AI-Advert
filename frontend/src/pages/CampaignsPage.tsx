import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Input, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FolderOpenOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useCampaigns } from "../hooks/useCampaigns";
import type { Campaign } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { EmptyState } from "../components/ui/EmptyState";
import { RelativeTime } from "../components/ui/RelativeTime";
import { ListSkeleton } from "../components/ui/Skeletons";

export default function CampaignsPage() {
  const { campaigns, loading, error } = useCampaigns();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campaigns;
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.product_name.toLowerCase().includes(needle) ||
        c.audience.toLowerCase().includes(needle),
    );
  }, [campaigns, query]);

  const columns: ColumnsType<Campaign> = [
    {
      title: "Campaign",
      dataIndex: "name",
      render: (_, record) => (
        <div>
          <Link to={`/campaigns/${record.id}`}>
            <Typography.Text strong>{record.name}</Typography.Text>
          </Link>
          <div className="subtle" style={{ fontSize: "var(--text-xs)" }}>
            {record.product_name}
          </div>
        </div>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Audience",
      dataIndex: "audience",
      responsive: ["md"],
      render: (value: string) => value || <span className="subtle">—</span>,
    },
    {
      title: "Tone",
      dataIndex: "tone",
      responsive: ["lg"],
      width: 120,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: "Brand kit",
      key: "brand",
      responsive: ["lg"],
      width: 140,
      render: (_, record) => (
        <span className="row" style={{ gap: 4 }}>
          {(record.brand_colors || []).slice(0, 4).map((color) => (
            <span
              key={color}
              title={color}
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: color,
                border: "1px solid var(--border-subtle)",
              }}
            />
          ))}
          {record.logo_b2_key ? <Tag color="blue">logo</Tag> : null}
        </span>
      ),
    },
    {
      title: "Created",
      dataIndex: "created_at",
      width: 150,
      sorter: (a, b) => a.created_at.localeCompare(b.created_at),
      defaultSortOrder: "descend",
      render: (value: string) => <RelativeTime value={value} />,
    },
    {
      title: "",
      key: "actions",
      width: 110,
      align: "right",
      render: (_, record) => (
        <Link to={`/campaigns/${record.id}/generate`}>
          <Button size="small" type="primary" ghost>
            Generate
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageMeta title="Campaigns" />
      <PageHeader
        title="Campaigns"
        description="A campaign holds the brief and brand kit that every generation run inherits."
        actions={
          <Link to="/campaigns/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New campaign
            </Button>
          </Link>
        }
      />

      {error ? (
        <Alert type="error" showIcon title="Could not load campaigns" description={error} />
      ) : null}

      <section className="surface">
        {loading ? (
          <div style={{ padding: "var(--space-6)" }}>
            <ListSkeleton />
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<FolderOpenOutlined />}
            title="No campaigns yet"
            description="Create your first campaign to describe the product, audience, and brand kit that generation runs will use."
            actions={
              <Link to="/campaigns/new">
                <Button type="primary" icon={<PlusOutlined />}>
                  Create campaign
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="toolbar" style={{ padding: "var(--space-4) var(--space-4) 0" }}>
              <Input
                allowClear
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                prefix={<SearchOutlined />}
                placeholder="Search campaigns…"
                style={{ maxWidth: 320 }}
                aria-label="Search campaigns"
              />
            </div>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 15, hideOnSinglePage: true }}
              locale={{ emptyText: "No campaigns match that search" }}
            />
          </>
        )}
      </section>
    </>
  );
}
