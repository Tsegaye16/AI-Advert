import { Tag, Tooltip } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  EditOutlined,
  LoadingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { AssetKind, RunStatus } from "../../types";

const RUN_STATUS: Record<
  RunStatus,
  { label: string; color: string; icon: React.ReactNode; hint: string }
> = {
  queued: {
    label: "Queued",
    color: "default",
    icon: <ClockCircleOutlined />,
    hint: "Waiting for a worker to pick this run up",
  },
  running: {
    label: "Running",
    color: "processing",
    icon: <LoadingOutlined />,
    hint: "Pipeline steps are executing",
  },
  storyboard: {
    label: "Needs review",
    color: "warning",
    icon: <EditOutlined />,
    hint: "Scenes are ready for you to review before video render",
  },
  succeeded: {
    label: "Complete",
    color: "success",
    icon: <CheckCircleFilled />,
    hint: "All steps finished successfully",
  },
  failed: {
    label: "Failed",
    color: "error",
    icon: <CloseCircleFilled />,
    hint: "A pipeline step returned an error",
  },
  cancelled: {
    label: "Cancelled",
    color: "default",
    icon: <StopOutlined />,
    hint: "Stopped by a user. Any assets already stored were kept.",
  },
};

export function RunStatusTag({ status }: { status: RunStatus }) {
  const meta = RUN_STATUS[status] ?? RUN_STATUS.queued;
  return (
    <Tooltip title={meta.hint}>
      <Tag color={meta.color} icon={meta.icon} style={{ marginInlineEnd: 0 }}>
        {meta.label}
      </Tag>
    </Tooltip>
  );
}

const ASSET_KIND: Record<string, { label: string; color: string }> = {
  final: { label: "Final cut", color: "success" },
  video: { label: "Video", color: "purple" },
  audio: { label: "Voiceover", color: "geekblue" },
  image: { label: "Image", color: "cyan" },
  manifest: { label: "Manifest", color: "default" },
  other: { label: "Other", color: "default" },
};

export function AssetKindTag({ kind }: { kind: AssetKind }) {
  const meta = ASSET_KIND[kind] ?? ASSET_KIND.other;
  return (
    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}
