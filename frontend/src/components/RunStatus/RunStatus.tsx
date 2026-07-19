import {
  Alert,
  Progress,
  Space,
  Steps,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PictureOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { Run, StepStatus } from "../../types";
import { filterSteps } from "../../utils/runSteps";

interface Props {
  run: Run | null;
  compact?: boolean;
  /** Show only storyboard, video, or all pipeline steps */
  phase?: "storyboard" | "video" | "all";
  title?: string;
}

function stepIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("storyboard") || n.startsWith("scene")) return <PictureOutlined />;
  if (n.includes("image")) return <PictureOutlined />;
  if (n.includes("video") || n.includes("compose") || n.includes("ffmpeg"))
    return <VideoCameraOutlined />;
  if (n.includes("voice") || n.includes("music") || n.includes("audio"))
    return <SoundOutlined />;
  return <ThunderboltOutlined />;
}

function antdStatus(step: StepStatus) {
  if (step.status === "succeeded") return "finish" as const;
  if (step.status === "failed") return "error" as const;
  if (step.status === "running") return "process" as const;
  return "wait" as const;
}

function runTagColor(status: string) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  if (status === "storyboard") return "gold";
  if (status === "running") return "processing";
  return "default";
}

function progressPercent(steps: StepStatus[]): number {
  if (!steps.length) return 8;
  const done = steps.filter(
    (s) => s.status === "succeeded" || s.status === "failed",
  ).length;
  const running = steps.some((s) => s.status === "running") ? 0.45 : 0;
  return Math.min(100, Math.round(((done + running) / steps.length) * 100));
}

export function RunStatus({
  run,
  compact,
  phase = "all",
  title,
}: Props) {
  if (!run) return null;

  const allSteps = run.steps || [];
  const steps = filterSteps(allSteps, phase);
  const pct =
    run.status === "succeeded" && phase !== "storyboard"
      ? 100
      : progressPercent(steps);

  const items = steps.map((step) => ({
    title: step.name,
    description:
      `${step.provider || ""}${step.model ? ` · ${step.model}` : ""}`.trim() ||
      undefined,
    status: antdStatus(step),
    icon:
      step.status === "running" ? (
        <LoadingOutlined />
      ) : step.status === "succeeded" ? (
        <CheckCircleOutlined />
      ) : step.status === "failed" ? (
        <CloseCircleOutlined />
      ) : (
        stepIcon(step.name)
      ),
  }));

  const headerTitle =
    title ||
    (phase === "storyboard"
      ? "Scene generation"
      : phase === "video"
        ? "Video production"
        : "Pipeline");

  if (!steps.length && phase !== "all") {
    return null;
  }

  return (
    <div className={`run-status-panel${compact ? " compact" : ""}`}>
      <div className="run-status-header">
        <Space wrap>
          <Typography.Text strong>{headerTitle}</Typography.Text>
          {phase === "all" ? (
            <>
              <Tag color={runTagColor(run.status)}>{run.status}</Tag>
              <Tag>{run.mode}</Tag>
            </>
          ) : null}
        </Space>
      </div>

      <Progress
        percent={pct}
        status={
          run.status === "failed"
            ? "exception"
            : run.status === "succeeded" && phase !== "storyboard"
              ? "success"
              : "active"
        }
        strokeColor={{ from: "#0f7a5f", to: "#3aa889" }}
        style={{ marginBottom: 16 }}
        size="small"
      />

      {items.length ? (
        <Steps
          items={items}
          size="small"
          direction="horizontal"
          responsive
        />
      ) : (
        <Typography.Text type="secondary">
          Waiting for pipeline steps…
        </Typography.Text>
      )}

      {run.error && phase === "all" ? (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message="Pipeline error"
          description={run.error}
        />
      ) : null}
    </div>
  );
}
