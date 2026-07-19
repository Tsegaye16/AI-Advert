import { Space, Tag, Typography } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  LoadingOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { Run } from "../../types";
import { runPhaseLabel } from "../../utils/runSteps";

interface Props {
  run: Run;
}

function statusColor(status: string) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  if (status === "storyboard") return "gold";
  if (status === "running") return "processing";
  return "default";
}

function phaseIcon(run: Run) {
  if (run.status === "storyboard") return <EditOutlined />;
  if (run.status === "running") return <LoadingOutlined />;
  if (run.status === "succeeded") return <CheckCircleOutlined />;
  return <ClockCircleOutlined />;
}

export function ActiveRunCard({ run }: Props) {
  const phase = runPhaseLabel(run);
  const started = run.started_at
    ? new Date(run.started_at).toLocaleString()
    : null;

  return (
    <div className="active-run-card">
      <div className="active-run-card__main">
        <div className="active-run-card__icon">{phaseIcon(run)}</div>
        <div>
          <Typography.Text className="active-run-card__label">
            Active run
          </Typography.Text>
          <Typography.Title level={5} className="active-run-card__phase">
            {phase}
          </Typography.Title>
          <Space wrap size={[6, 4]} className="active-run-card__meta">
            <Tag color={statusColor(run.status)}>{run.status}</Tag>
            <Tag icon={<VideoCameraOutlined />}>{run.mode} ad</Tag>
            <Typography.Text type="secondary" className="mono">
              {run.id.slice(0, 8)}…
            </Typography.Text>
          </Space>
        </div>
      </div>
      <div className="active-run-card__aside">
        {started ? (
          <Typography.Text type="secondary" className="active-run-card__time">
            Started {started}
          </Typography.Text>
        ) : null}
        <Typography.Text type="secondary" className="active-run-card__hint">
          {run.status === "storyboard"
            ? "Edit scenes below, then generate video."
            : run.status === "running"
              ? "Pipeline steps appear in the workflow section."
              : "Outputs land in the asset gallery."}
        </Typography.Text>
      </div>
    </div>
  );
}
