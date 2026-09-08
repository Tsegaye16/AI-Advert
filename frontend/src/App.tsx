import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";

const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const CampaignDetailPage = lazy(() => import("./pages/CampaignDetailPage"));
const NewCampaignPage = lazy(() => import("./pages/NewCampaignPage"));
const GeneratePage = lazy(() => import("./pages/GeneratePage"));
const RunsPage = lazy(() => import("./pages/RunsPage"));
const RunDetailPage = lazy(() => import("./pages/RunDetailPage"));
const AssetsPage = lazy(() => import("./pages/AssetsPage"));
const AssetDetailPage = lazy(() => import("./pages/AssetDetailPage"));
const VerifyPage = lazy(() => import("./pages/VerifyPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/new" element={<NewCampaignPage />} />
        <Route path="campaigns/:campaignId" element={<CampaignDetailPage />} />
        <Route path="campaigns/:campaignId/generate" element={<GeneratePage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:runId" element={<RunDetailPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/:assetId" element={<AssetDetailPage />} />
        <Route path="verify" element={<VerifyPage />} />
        <Route path="verify/:assetId" element={<VerifyPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
