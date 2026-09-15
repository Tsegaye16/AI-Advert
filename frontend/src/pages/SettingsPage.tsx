import { useEffect, useState } from "react";
import { Alert, Descriptions, Segmented, Switch, Tag, Typography } from "antd";
import { getHealth, getProvidersStatus } from "../services/api";
import type { HealthStatus, ProviderSlot, ProvidersStatus } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { ListSkeleton } from "../components/ui/Skeletons";
import { useTheme } from "../theme/themeContext";

const SLOT_LABEL: Record<ProviderSlot, string> = {
  image: "Image",
  video: "Video",
  tts: "Voiceover",
  music: "Music",
};

export default function SettingsPage() {
  const { preference, density, setPreference, setDensity } = useTheme();
  const [providers, setProviders] = useState<ProvidersStatus | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([getProvidersStatus(), getHealth()])
      .then(([p, h]) => {
        if (!alive) return;
        setProviders(p);
        setHealth(h);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <PageMeta title="Settings" />
      <PageHeader
        title="Settings"
        description="Appearance preferences are stored in this browser. Provider credentials and storage are configured server-side through environment variables."
      />

      <section className="surface surface--padded">
        <div className="section-head">
          <div>
            <h3 className="section-head__title">Appearance</h3>
            <span className="section-head__sub">
              Applies to this browser only.
            </span>
          </div>
        </div>

        <div className="stack">
          <div className="toolbar">
            <div>
              <Typography.Text strong>Theme</Typography.Text>
              <div className="subtle" style={{ fontSize: "var(--text-sm)" }}>
                Match your operating system or pin a single mode.
              </div>
            </div>
            <Segmented
              value={preference}
              onChange={(v) => setPreference(v as typeof preference)}
              options={[
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
                { label: "System", value: "system" },
              ]}
            />
          </div>

          <div className="toolbar">
            <div>
              <Typography.Text strong>Compact density</Typography.Text>
              <div className="subtle" style={{ fontSize: "var(--text-sm)" }}>
                Tightens control heights and spacing for dense review sessions.
              </div>
            </div>
            <Switch
              checked={density === "compact"}
              onChange={(on) => setDensity(on ? "compact" : "comfortable")}
              aria-label="Toggle compact density"
            />
          </div>
        </div>
      </section>

      <section className="surface surface--padded">
        <div className="section-head">
          <div>
            <h3 className="section-head__title">Pipeline configuration</h3>
            <span className="section-head__sub">
              Read-only view of what this deployment resolved at startup.
            </span>
          </div>
        </div>

        {error ? (
          <Alert type="error" showIcon title="Could not read server configuration" description={error} />
        ) : loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="stack">
            {providers?.hint ? (
              <Alert type="info" showIcon title={providers.hint} />
            ) : null}

            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, md: 2 }}
              items={[
                {
                  key: "storage",
                  label: "Backblaze B2",
                  children: !health?.b2_configured
                    ? "Not configured"
                    : health.b2_connected
                      ? "Connected"
                      : "Configured but unreachable",
                },
                {
                  key: "ffmpeg",
                  label: "FFmpeg",
                  children: health?.ffmpeg_present ? "Available" : "Missing",
                },
                {
                  key: "mode",
                  label: "Mode",
                  children: health?.demo_mode
                    ? "Demo — synthetic assets, no provider calls"
                    : "Live providers",
                },
                {
                  key: "status",
                  label: "Health",
                  children: health?.status === "degraded" ? "Degraded" : "OK",
                },
              ]}
            />

            <div>
              <Typography.Text strong>Resolved providers</Typography.Text>
              <div className="row row--wrap" style={{ marginTop: 8 }}>
                {(Object.keys(SLOT_LABEL) as ProviderSlot[]).map((slot) => {
                  const sel = providers?.selected?.[slot];
                  return (
                    <Tag key={slot} color={sel?.vendor ? "blue" : "default"}>
                      {SLOT_LABEL[slot]}: {sel?.vendor || "unavailable"}
                      {sel?.model ? ` · ${sel.model}` : ""}
                    </Tag>
                  );
                })}
              </div>
            </div>

            <div>
              <Typography.Text strong>Credential status</Typography.Text>
              <div className="row row--wrap" style={{ marginTop: 8 }}>
                {Object.entries(providers?.keys || {}).map(([vendor, ok]) => (
                  <Tag key={vendor} color={ok ? "success" : "default"}>
                    {vendor}
                    {ok ? "" : " — no key"}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
