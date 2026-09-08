import { Tooltip } from "antd";
import { formatAbsolute, formatRelative } from "../../utils/time";

export function RelativeTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="subtle">—</span>;
  return (
    <Tooltip title={formatAbsolute(value)}>
      <time dateTime={value}>{formatRelative(value)}</time>
    </Tooltip>
  );
}
