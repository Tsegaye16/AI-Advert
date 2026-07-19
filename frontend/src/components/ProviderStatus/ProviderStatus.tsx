import { useEffect, useState } from "react";
import { Alert, Tag, Typography } from "antd";
import { getProvidersStatus } from "../../services/api";

type SelectedSlot = {
  vendor?: string;
  model?: string;
};

type ProviderStatusPayload = {
  b2?: boolean;
  demo_mode?: boolean;
  selected?: {
    image?: SelectedSlot;
    video?: SelectedSlot;
    tts?: SelectedSlot;
    music?: SelectedSlot;
  };
  hint?: string;
};

export function ProviderStatusPanel() {
  const [status, setStatus] = useState<ProviderStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getProvidersStatus()
      .then((data) => {
        setStatus(data as ProviderStatusPayload);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return null;
  if (!status) return null;

  const selected = status.selected || {};
  const slots = [
    { label: "Image", slot: selected.image },
    { label: "Video", slot: selected.video },
    { label: "TTS", slot: selected.tts },
    { label: "Music", slot: selected.music },
  ].filter((item) => item.slot?.vendor);

  return (
    <Alert
      type={status.demo_mode ? "warning" : status.b2 ? "success" : "info"}
      showIcon
      style={{ marginBottom: 16 }}
      message={
        status.demo_mode
          ? "Demo mode — synthetic assets, no B2 or Genblaze manifests"
          : status.b2
            ? "Live pipeline — Backblaze B2 + Genblaze orchestration"
            : "B2 not configured — generation may fail without storage keys"
      }
      description={
        <div className="provider-status-grid">
          <Typography.Text type="secondary">
            Auto-selected providers for this deployment:
          </Typography.Text>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {slots.map(({ label, slot }) => (
              <Tag key={label} color="green">
                {label}: {slot?.vendor} · {slot?.model}
              </Tag>
            ))}
          </div>
          {status.hint ? (
            <Typography.Paragraph
              type="secondary"
              style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
            >
              {status.hint}
            </Typography.Paragraph>
          ) : null}
        </div>
      }
    />
  );
}
