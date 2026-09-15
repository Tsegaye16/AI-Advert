import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, App, Button, Skeleton, Tag, Typography } from "antd";
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RedoOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { cancelRun, finalizeStoryboard, listAssets, retryRun } from "../services/api";
import { useRun } from "../hooks/useRun";
import type { Asset } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { RunStatusTag } from "../components/ui/StatusTag";
import { RelativeTime } from "../components/ui/RelativeTime";
import { formatElapsed } from "../utils/time";
import { CopyableHash } from "../components/ui/CopyableHash";
import { RunPipeline } from "../components/RunPipeline/RunPipeline";
import { StoryboardEditor } from "../components/Storyboard/StoryboardEditor";
import { AssetGrid } from "../components/AssetGrid/AssetGrid";
import { filterSteps } from "../utils/runSteps";
import { useEffect } from "react";

export default function RunDetailPage() {
  const { runId = "" } = useParams();
  const { message, modal } = App.useApp();
  const { run, loading, error, refresh } = useRun(runId);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [storyboardReady, setStoryboardReady] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const loadAssets = useCallback(async () => {
    if (!run?.campaign_id) return;
    try {
      const all = await listAssets(run.campaign_id);
      setAssets(all.filter((a) => a.run_id === runId));
    } catch {
      /* the run view is still useful without the gallery */
    }
  }, [run?.campaign_id, runId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets, run?.status, run?.steps?.length]);

  const hasStoryboard = useMemo(
    () => filterSteps(run?.steps || [], "storyboard").length > 0,
    [run?.steps],
  );
  const hasVideoPhase = useMemo(
    () => filterSteps(run?.steps || [], "video").length > 0,
    [run?.steps],
  );

  const finalize = async () => {
    setFinalizing(true);
    try {
      await finalizeStoryboard(runId);
      message.success("Rendering the multi-scene video and voiceover");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not start the render");
    } finally {
      setFinalizing(false);
    }
  };

  const cancel = () => {
    modal.confirm({
      title: "Cancel this run?",
      content:
        "The provider call already in flight will finish, then the pipeline stops. Anything already written to storage is kept.",
      okText: "Cancel run",
      okButtonProps: { danger: true },
      cancelText: "Keep running",
      onOk: async () => {
        setActionBusy(true);
        try {
          await cancelRun(runId);
          message.success("Cancellation requested — the current step will finish");
          await refresh();
        } catch (err) {
          message.error(
            err instanceof Error ? err.message : "Could not cancel the run",
          );
        } finally {
          setActionBusy(false);
        }
      },
    });
  };

  const retry = async () => {
    setActionBusy(true);
    try {
      await retryRun(runId);
      message.success("Run re-queued with the original settings");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not retry the run");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && !run) {
    return (
      <>
        <PageMeta title="Run" />
        <Skeleton active paragraph={{ rows: 6 }} />
      </>
    );
  }

  if (error && !run) {
    return (
      <>
        <PageMeta title="Run" />
        <Alert
          type="error"
          showIcon
          title="Run unavailable"
          description={error}
          action={
            <Link to="/runs">
              <Button size="small">All runs</Button>
            </Link>
          }
        />
      </>
    );
  }

  if (!run) return null;

  const elapsed = formatElapsed(run.started_at, run.finished_at);

  return (
    <>
      <PageMeta title={`Run ${run.id.slice(0, 8)}`} />
      <PageHeader
        eyebrow={
          <>
            <Link to="/runs">
              <Button type="text" size="small" icon={<ArrowLeftOutlined />}>
                Runs
              </Button>
            </Link>
            <RunStatusTag status={run.status} />
            <Tag>{run.mode === "full" ? "Full ad" : "Hero image"}</Tag>
            {run.parent_run_id ? (
              <Link to={`/runs/${run.parent_run_id}`}>
                <Tag color="purple">remix of {run.parent_run_id.slice(0, 8)}</Tag>
              </Link>
            ) : null}
          </>
        }
        title={`Run ${run.id.slice(0, 8)}`}
        description={
          <>
            Started <RelativeTime value={run.started_at || run.created_at} />
            {elapsed ? ` · ${elapsed}` : ""} ·{" "}
            <Link to={`/campaigns/${run.campaign_id}`}>View campaign</Link>
          </>
        }
        actions={
          <>
            {run.status === "running" || run.status === "queued" ? (
              <Button
                danger
                icon={<StopOutlined />}
                loading={actionBusy}
                onClick={cancel}
              >
                Cancel
              </Button>
            ) : null}
            {run.status === "failed" || run.status === "cancelled" ? (
              <Button
                type="primary"
                icon={<RedoOutlined />}
                loading={actionBusy}
                onClick={() => void retry()}
              >
                Retry
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
              Refresh
            </Button>
          </>
        }
      />

      {run.status === "storyboard" ? (
        <Alert
          type="warning"
          showIcon
          title="Storyboard ready for review"
          description="Adjust any scene prompt and regenerate before committing to the video render."
          action={
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={finalizing}
              disabled={!storyboardReady}
              onClick={() => void finalize()}
            >
              Render video
            </Button>
          }
        />
      ) : null}

      {run.status === "cancelled" ? (
        <Alert
          type="info"
          showIcon
          title="Run cancelled"
          description="The step already in flight was allowed to finish. Anything it produced is listed below; retry to start over from the original brief."
        />
      ) : run.error ? (
        <Alert type="error" showIcon title="This run failed" description={run.error} />
      ) : null}

      <section className="surface surface--padded">
        <RunPipeline run={run} title="Pipeline" />
      </section>

      {hasStoryboard ? (
        <section className="surface surface--padded">
          <StoryboardEditor
            runId={runId}
            locked={
              finalizing || run.status === "running" || run.status === "cancelled"
            }
            onReadyChange={setStoryboardReady}
          />
        </section>
      ) : null}

      {hasVideoPhase && run.status === "succeeded" ? (
        <Alert
          type="success"
          showIcon
          title="Ad pack complete"
          description="The final cut, its source scenes, and the voiceover are all in the gallery below."
        />
      ) : null}

      <section className="surface surface--padded">
        <div className="section-head">
          <div>
            <h3 className="section-head__title">Outputs</h3>
            <span className="section-head__sub">
              Every artifact this run produced, each with its own provenance record.
            </span>
          </div>
          {run.canonical_hash ? (
            <span className="row">
              <Typography.Text type="secondary" style={{ fontSize: "var(--text-sm)" }}>
                Manifest hash
              </Typography.Text>
              <CopyableHash value={run.canonical_hash} label="canonical hash" />
            </span>
          ) : null}
        </div>

        <AssetGrid
          assets={assets}
          compact
          onChanged={() => void loadAssets()}
          emptyTitle="No outputs yet"
          emptyDescription="Assets appear here as each pipeline step completes."
        />
      </section>
    </>
  );
}
