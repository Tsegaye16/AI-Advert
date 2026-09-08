import { Alert, Progress, Steps, Tooltip, Typography } from "antd";
import {
  AudioOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { Run, StepStatus } from "../../types";
import { filterSteps } from "../../utils/runSteps";

type Phase = "storyboard" | "video" | "all";

function stepIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("video") || n.includes("compose") || n.includes("mux"))
    return <VideoCameraOutlined />;
  if (n.includes("voice") || n.includes("music") || n.includes("audio"))
    return <AudioOutlined />;
  if (n.includes("scene") || n.includes("image") || n.includes("storyboard"))
    return <PictureOutlined />;
  return <ThunderboltOutlined />;
}

function stepState(status: string): "wait" | "process" | "finish" | "error" {
  const s = status.toLowerCase();
  if (s === "succeeded" || s === "success" || s === "completed") return "finish";
  if (s === "running" || s === "in_progress") return "process";
  if (s === "failed" || s === "error") return "error";
  if (s === "cancelled" || s === "canceled") return "wait";
  return "wait";
}

function progressOf(steps: StepStatus[]): number {
  if (steps.length === 0) return 0;
  const score = steps.reduce((acc, step) => {
    const state = stepState(step.status);
    if (state === "finish") return acc + 1;
    if (state === "process") return acc + 0.45;
    return acc;
  }, 0);
  return Math.min(100, Math.round((score / steps.length) * 100));
}

function humanStepName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\bvo\b/i, "voiceover")
    .replace(/^\w/, (c) => c.toUpperCase());
}

interface Props {
  run: Run;
  phase?: Phase;
  title?: string;
  /** Hides the progress bar for dense, embedded contexts. */
  minimal?: boolean;
}

export function RunPipeline({ run, phase = "all", title, minimal = false }: Props) {
  const steps = filterSteps(run.steps || [], phase);

  if (steps.length === 0) {
    return (
      <Typography.Text type="secondary">
        {run.status === "queued"
          ? "Waiting for the pipeline to start…"
          : "No steps recorded for this phase yet."}
      </Typography.Text>
    );
  }

  const percent = progressOf(steps);
  const failed = steps.some((s) => stepState(s.status) === "error");

  return (
    <div className="run-steps">
      {title ? <h3 className="section-head__title">{title}</h3> : null}

      {!minimal ? (
        <div className="run-steps__bar">
          <Progress
            percent={percent}
            status={failed ? "exception" : percent === 100 ? "success" : "active"}
            showInfo={false}
            aria-label={`Pipeline ${percent}% complete`}
          />
          <Typography.Text
            className="mono"
            style={{ minWidth: 40, textAlign: "right" }}
          >
            {percent}%
          </Typography.Text>
        </div>
      ) : null}

      <Steps
        orientation="vertical"
        size="small"
        items={steps.map((step) => {
          const state = stepState(step.status);
          return {
            status: state,
            title: (
              <span className="row" style={{ gap: 8 }}>
                {humanStepName(step.name)}
                {step.fallback_used ? (
                  <Tooltip title="The preferred vendor failed; a fallback produced this step.">
                    <Typography.Text
                      type="warning"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      fallback
                    </Typography.Text>
                  </Tooltip>
                ) : null}
              </span>
            ),
            content: (
              <Typography.Text
                type="secondary"
                style={{ fontSize: "var(--text-xs)" }}
              >
                {[step.provider, step.model].filter(Boolean).join(" · ") || "—"}
                {step.error ? ` — ${step.error}` : ""}
              </Typography.Text>
            ),
            icon:
              state === "process" ? (
                <LoadingOutlined />
              ) : state === "finish" ? (
                <CheckCircleFilled style={{ color: "var(--success)" }} />
              ) : state === "error" ? (
                <CloseCircleFilled style={{ color: "var(--danger)" }} />
              ) : (
                stepIcon(step.name)
              ),
          };
        })}
      />

      {run.error ? (
        <Alert type="error" showIcon title="Pipeline failed" description={run.error} />
      ) : null}
    </div>
  );
}
