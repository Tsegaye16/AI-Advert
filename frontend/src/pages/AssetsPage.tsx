import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, App, Button, Modal, Input, Pagination, Select } from "antd";
import { listAllAssets, pollRun, remixRun } from "../services/api";
import type { Asset, Run } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { AssetGrid } from "../components/AssetGrid/AssetGrid";
import { useCampaigns } from "../hooks/useCampaigns";

const PAGE_SIZE = 24;

export default function AssetsPage() {
  const [params, setParams] = useSearchParams();
  const { campaigns } = useCampaigns();
  const { message } = App.useApp();

  const campaignId = params.get("campaign") || undefined;
  const runId = params.get("run") || undefined;
  const page = Number(params.get("page") || 1);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [remixTarget, setRemixTarget] = useState<Asset | null>(null);
  const [remixPrompt, setRemixPrompt] = useState("");
  const [remixing, setRemixing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAllAssets({
        page,
        pageSize: PAGE_SIZE,
        campaignId,
        runId,
      });
      setAssets(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assets");
    } finally {
      setLoading(false);
    }
  }, [page, campaignId, runId]);

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

  const startRemix = async () => {
    if (!remixTarget || !remixPrompt.trim()) return;
    setRemixing(true);
    try {
      const run: Run = await remixRun(remixTarget.run_id, {
        prompt_override: remixPrompt.trim(),
      });
      message.success("Remix started");
      setRemixTarget(null);
      setRemixPrompt("");
      await pollRun(run.id);
      await load();
      message.success("Remix complete");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Remix failed");
    } finally {
      setRemixing(false);
    }
  };

  return (
    <>
      <PageMeta title="Assets" />
      <PageHeader
        title="Assets"
        description="Every generated artifact across all campaigns, backed by Backblaze B2 and a signed provenance manifest."
      />

      {error ? (
        <Alert type="error" showIcon title="Could not load assets" description={error} />
      ) : null}

      <section className="surface surface--padded">
        <div className="toolbar" style={{ marginBottom: "var(--space-5)" }}>
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
            {runId ? (
              <Button size="small" onClick={() => setParam("run", undefined)}>
                Clear run filter
              </Button>
            ) : null}
          </div>
        </div>

        <AssetGrid
          assets={assets}
          loading={loading}
          onChanged={() => void load()}
          onRemix={(asset) => {
            setRemixTarget(asset);
            setRemixPrompt("");
          }}
          emptyTitle="No assets yet"
          emptyDescription="Run a generation from any campaign and its outputs will land here."
          emptyAction={
            <Link to="/campaigns">
              <Button type="primary">Go to campaigns</Button>
            </Link>
          }
        />

        {total > PAGE_SIZE ? (
          <div className="row" style={{ justifyContent: "center", marginTop: "var(--space-6)" }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={(next) => setParam("page", String(next))}
            />
          </div>
        ) : null}
      </section>

      <Modal
        open={!!remixTarget}
        title="Remix from this asset"
        okText="Start remix"
        confirmLoading={remixing}
        onCancel={() => setRemixTarget(null)}
        onOk={() => void startRemix()}
        okButtonProps={{ disabled: !remixPrompt.trim() }}
      >
        <p className="muted" style={{ marginBottom: 12 }}>
          A new run is created with this asset's run recorded as its parent, so the
          lineage stays verifiable.
        </p>
        <Input.TextArea
          rows={4}
          value={remixPrompt}
          maxLength={2000}
          showCount
          autoFocus
          placeholder="Describe the variation you want…"
          onChange={(e) => setRemixPrompt(e.target.value)}
        />
      </Modal>
    </>
  );
}
