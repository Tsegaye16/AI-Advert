import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ConfigProvider,
  Layout,
  Select,
  Typography,
  theme,
} from "antd";
import { CampaignBuilder } from "./components/CampaignBuilder/CampaignBuilder";
import { AssetGallery } from "./components/AssetGallery/AssetGallery";
import { ActiveRunCard } from "./components/ActiveRunCard/ActiveRunCard";
import { ProviderStatusPanel } from "./components/ProviderStatus/ProviderStatus";
import { useAssets } from "./hooks/useAssets";
import { useCampaigns } from "./hooks/useCampaigns";
import { getProvidersStatus } from "./services/api";
import type { Campaign, Run } from "./types";
import { filterSteps, isVideoPipelineStep } from "./utils/runSteps";
import "./styles/globals.css";

const { Content } = Layout;

/** Gallery shows run assets only after scenes exist or video phase has started. */
function galleryRunFilter(run: Run | null): string | null {
  if (!run) return null;
  if (run.status === "storyboard" || run.status === "succeeded" || run.status === "failed") {
    return run.id;
  }
  if (run.status === "running") {
    const hasVideo = (run.steps || []).some((s) => isVideoPipelineStep(s.name));
    if (hasVideo) return run.id;
  }
  return null;
}

function galleryFilterLabel(run: Run | null): string | undefined {
  if (!run) return undefined;
  const runFilter = galleryRunFilter(run);
  if (!runFilter) {
    return "Assets appear here after scene generation completes";
  }
  return `Showing assets for current run (${run.id.slice(0, 8)}…)`;
}

export default function App() {
  const { campaigns, refresh: refreshCampaigns } = useCampaigns();
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [galleryCampaignId, setGalleryCampaignId] = useState<string | undefined>(
    undefined,
  );
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const lastGalleryRefreshKey = useRef<string | null>(null);

  const effectiveGalleryCampaignId =
    galleryCampaignId === ""
      ? null
      : galleryCampaignId ??
        activeCampaign?.id ??
        activeRun?.campaign_id ??
        campaigns[0]?.id ??
        null;

  const galleryRunId = galleryRunFilter(activeRun);

  const sceneGenerationInProgress = Boolean(
    activeRun?.status === "running" &&
      filterSteps(activeRun.steps || [], "storyboard").length > 0 &&
      filterSteps(activeRun.steps || [], "video").length === 0,
  );

  const {
    assets,
    total,
    page,
    pageSize,
    setPage,
    loading: assetsLoading,
    error: assetsError,
    refreshFromStart: refreshAssetsFromStart,
  } = useAssets(effectiveGalleryCampaignId, galleryRunId);

  useEffect(() => {
    void getProvidersStatus()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
  }, []);

  useEffect(() => {
    if (!activeCampaign && campaigns[0]) {
      setActiveCampaign(campaigns[0]);
    }
  }, [campaigns, activeCampaign]);

  const onCampaignCreated = useCallback(
    (campaign: Campaign) => {
      setActiveCampaign(campaign);
      setGalleryCampaignId(campaign.id);
      void refreshCampaigns();
    },
    [refreshCampaigns],
  );

  const onCampaignSelected = useCallback((campaign: Campaign) => {
    setActiveCampaign(campaign);
    setGalleryCampaignId(campaign.id);
  }, []);

  const onRunUpdate = useCallback(
    (run: Run) => {
      setActiveRun(run);
      setGalleryCampaignId(run.campaign_id);

      const shouldRefreshGallery =
        run.status === "storyboard" ||
        run.status === "succeeded" ||
        run.status === "failed" ||
        (run.status === "running" &&
          filterSteps(run.steps || [], "video").length > 0);

      if (!shouldRefreshGallery) return;

      const key = `${run.id}:${run.status}:${filterSteps(run.steps || [], "video").length}`;
      if (lastGalleryRefreshKey.current === key) return;
      lastGalleryRefreshKey.current = key;
      void refreshAssetsFromStart();
    },
    [refreshAssetsFromStart],
  );

  const onGenerationStarted = useCallback(() => {
    lastGalleryRefreshKey.current = null;
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#0f7a5f",
          colorInfo: "#0f7a5f",
          colorWarning: "#c45c26",
          borderRadius: 10,
          fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        },
      }}
    >
      <Layout className="app-shell">
        <header className="app-header">
          <div className="brand">
            <strong>AdVault</strong>
            <span>Provenance-driven AI ad packs · Genblaze + Backblaze B2</span>
          </div>
        </header>

        <Content className="app-content">
          <section className="hero-strip">
            <div>
              <h1>From brief to verifiable ad pack.</h1>
              <p>
                Build campaign creatives with a multi-step Genblaze pipeline, store
                every artifact on Backblaze B2, and prove integrity with SHA-256
                provenance manifests.
              </p>
            </div>
            <div className="hero-meta">
              <Typography.Text type="secondary">Gallery filter</Typography.Text>
              <Select
                style={{ minWidth: 260 }}
                placeholder="All campaigns"
                value={
                  galleryCampaignId === ""
                    ? ""
                    : (galleryCampaignId ??
                        activeCampaign?.id ??
                        campaigns[0]?.id ??
                        "")
                }
                onChange={(val) => {
                  setGalleryCampaignId(val);
                  const match = campaigns.find((c) => c.id === val);
                  if (match) setActiveCampaign(match);
                }}
                options={[
                  { value: "", label: "All campaigns" },
                  ...campaigns.map((c) => ({
                    value: c.id,
                    label: `${c.name} · ${c.product_name}`,
                  })),
                ]}
              />
            </div>
          </section>

          {apiOnline === false ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Backend not reachable"
              description="Start the FastAPI server on :8000 (DEMO_MODE=true works without API keys)."
            />
          ) : null}

          {apiOnline ? <ProviderStatusPanel /> : null}

          <CampaignBuilder
            campaigns={campaigns}
            defaultCampaignId={activeCampaign?.id || campaigns[0]?.id}
            onCampaignCreated={onCampaignCreated}
            onCampaignSelected={onCampaignSelected}
            onRunUpdate={onRunUpdate}
            onGenerationStarted={onGenerationStarted}
          />

          {activeRun ? (
            <div className="panel active-run-panel">
              <ActiveRunCard run={activeRun} />
            </div>
          ) : null}

          <AssetGallery
            assets={sceneGenerationInProgress ? [] : assets}
            loading={assetsLoading && !sceneGenerationInProgress}
            error={assetsError}
            total={sceneGenerationInProgress ? 0 : total}
            page={page}
            pageSize={pageSize}
            filterLabel={galleryFilterLabel(activeRun)}
            onPageChange={setPage}
            onRemixed={onRunUpdate}
            onChanged={() => {
              lastGalleryRefreshKey.current = null;
              void refreshAssetsFromStart();
            }}
          />
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
