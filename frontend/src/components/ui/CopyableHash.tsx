import { Button, Tooltip, Typography } from "antd";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { useState } from "react";

interface Props {
  value: string | null | undefined;
  /** Characters to show before eliding the middle. */
  head?: number;
  tail?: number;
  label?: string;
}

function elide(value: string, head: number, tail: number): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function CopyableHash({ value, head = 10, tail = 8, label }: Props) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return <Typography.Text className="subtle">—</Typography.Text>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the full value is in the tooltip */
    }
  };

  return (
    <span className="hash-row">
      <Tooltip title={value}>
        <Typography.Text className="mono truncate">
          {elide(value, head, tail)}
        </Typography.Text>
      </Tooltip>
      <Button
        type="text"
        size="small"
        aria-label={copied ? "Copied" : `Copy ${label || "value"}`}
        icon={copied ? <CheckOutlined style={{ color: "var(--success)" }} /> : <CopyOutlined />}
        onClick={() => void copy()}
      />
    </span>
  );
}
