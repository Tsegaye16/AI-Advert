import { useEffect, useState } from "react";
import { Radio, Typography } from "antd";
import { listFormats } from "../../services/api";
import type { VideoFormatKey, VideoFormatOption } from "../../types";

const FALLBACK: VideoFormatOption[] = [
  {
    key: "landscape",
    label: "Landscape 16:9",
    width: 1280,
    height: 720,
    aspect: "16:9",
    platforms: ["YouTube", "Web"],
  },
  {
    key: "square",
    label: "Square 1:1",
    width: 1080,
    height: 1080,
    aspect: "1:1",
    platforms: ["Feed"],
  },
  {
    key: "portrait",
    label: "Portrait 4:5",
    width: 1080,
    height: 1350,
    aspect: "4:5",
    platforms: ["Instagram"],
  },
  {
    key: "vertical",
    label: "Vertical 9:16",
    width: 1080,
    height: 1920,
    aspect: "9:16",
    platforms: ["Reels", "TikTok", "Shorts"],
  },
];

/** Scaled preview so the shape of each placement is obvious at a glance. */
function Thumb({ aspect, active }: { aspect: string; active: boolean }) {
  const [w, h] = aspect.split(":").map(Number);
  const maxSide = 34;
  const scale = maxSide / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: Math.round(w * scale),
        height: Math.round(h * scale),
        borderRadius: 3,
        border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
        background: active ? "var(--accent-subtle)" : "transparent",
      }}
    />
  );
}

interface Props {
  value?: VideoFormatKey;
  onChange?: (value: VideoFormatKey) => void;
}

export function FormatPicker({ value = "landscape", onChange }: Props) {
  const [formats, setFormats] = useState<VideoFormatOption[]>(FALLBACK);

  useEffect(() => {
    let alive = true;
    void listFormats()
      .then((data) => alive && data.length && setFormats(data))
      .catch(() => {
        /* fallback list keeps the wizard usable offline */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Radio.Group
      value={value}
      onChange={(e) => onChange?.(e.target.value as VideoFormatKey)}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}
    >
      {formats.map((format) => {
        const active = format.key === value;
        return (
          <Radio.Button
            key={format.key}
            value={format.key}
            style={{
              height: "auto",
              padding: "var(--space-3) var(--space-4)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <Thumb aspect={format.aspect} active={active} />
            <span style={{ display: "block", textAlign: "left" }}>
              <Typography.Text strong style={{ display: "block" }}>
                {format.aspect}
              </Typography.Text>
              <Typography.Text
                type="secondary"
                style={{ fontSize: "var(--text-xs)" }}
              >
                {format.width}×{format.height} · {format.platforms.slice(0, 2).join(", ")}
              </Typography.Text>
            </span>
          </Radio.Button>
        );
      })}
    </Radio.Group>
  );
}
