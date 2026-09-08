import { Popover, Typography } from "antd";
import { Link } from "react-router-dom";
import { useHealth } from "../../hooks/useHealth";

type Tone = "ok" | "warn" | "bad" | "idle";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--success)",
  warn: "var(--warning)",
  bad: "var(--danger)",
  idle: "var(--text-tertiary)",
};

function Row({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
      <Typography.Text type="secondary" style={{ fontSize: "var(--text-sm)" }}>
        {label}
      </Typography.Text>
      <span className="row" style={{ gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: TONE_COLOR[tone],
          }}
        />
        <Typography.Text style={{ fontSize: "var(--text-sm)" }}>{value}</Typography.Text>
      </span>
    </div>
  );
}

export function SystemStatusBadge() {
  const { health, reachable } = useHealth();

  const tone: Tone =
    reachable === null
      ? "idle"
      : !reachable
        ? "bad"
        : health?.demo_mode
          ? "warn"
          : health?.status === "degraded"
            ? "warn"
            : "ok";

  const label =
    reachable === null
      ? "Checking…"
      : !reachable
        ? "Backend offline"
        : health?.demo_mode
          ? "Demo mode"
          : health?.status === "degraded"
            ? "Degraded"
            : "All systems normal";

  const detail = (
    <div className="stack stack--sm" style={{ minWidth: 220 }}>
      {reachable === false ? (
        <Typography.Text type="secondary" style={{ fontSize: "var(--text-sm)" }}>
          Cannot reach the API. Start the backend on port 8000 — DEMO_MODE=true works
          without provider keys.
        </Typography.Text>
      ) : health ? (
        <>
          <Row
            label="Backblaze B2"
            value={
              !health.b2_configured
                ? "Not configured"
                : health.b2_connected
                  ? "Connected"
                  : "Unreachable"
            }
            tone={
              !health.b2_configured ? "warn" : health.b2_connected ? "ok" : "bad"
            }
          />
          <Row
            label="FFmpeg"
            value={health.ffmpeg_present ? "Available" : "Missing"}
            tone={health.ffmpeg_present ? "ok" : "warn"}
          />
          <Row
            label="Pipeline"
            value={health.demo_mode ? "Demo (synthetic)" : "Live providers"}
            tone={health.demo_mode ? "warn" : "ok"}
          />
          <Link to="/settings" style={{ fontSize: "var(--text-sm)" }}>
            Open settings
          </Link>
        </>
      ) : null}
    </div>
  );

  return (
    <Popover content={detail} title="System status" placement="rightBottom" trigger="click">
      <button
        type="button"
        className="row"
        style={{
          width: "100%",
          gap: 8,
          padding: "var(--space-2)",
          background: "none",
          border: 0,
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: "var(--text-sm)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: TONE_COLOR[tone],
            flexShrink: 0,
          }}
        />
        <span className="truncate">{label}</span>
      </button>
    </Popover>
  );
}
