import axios from "axios";
import type {
  Asset,
  AssetPage,
  Campaign,
  CampaignCreate,
  GenerateRequest,
  PresignedUrl,
  Provenance,
  RemixRequest,
  Run,
  Storyboard,
  VerifyResult,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    let detail = error?.response?.data?.detail;
    const raw = error?.response?.data;
    if (detail == null && typeof Blob !== "undefined" && raw instanceof Blob) {
      try {
        const parsed = JSON.parse(await raw.text()) as { detail?: unknown };
        detail = parsed.detail;
      } catch {
        /* ignore */
      }
    }
    let message = error?.message || "Request failed";
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((d) => (typeof d === "string" ? d : d?.msg || JSON.stringify(d)))
        .join("; ");
    } else if (detail && typeof detail === "object") {
      message = JSON.stringify(detail);
    }
    const enriched = new Error(message);
    Object.assign(enriched, { cause: error, response: error?.response });
    return Promise.reject(enriched);
  },
);

export const listCampaigns = async () => {
  const { data } = await api.get<Campaign[]>("/campaigns");
  return data;
};

export const createCampaign = async (payload: CampaignCreate) => {
  const { data } = await api.post<Campaign>("/campaigns", payload);
  return data;
};

export const uploadCampaignLogo = async (campaignId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<Campaign>(`/campaigns/${campaignId}/logo`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const deleteCampaignLogo = async (campaignId: string) => {
  const { data } = await api.delete<Campaign>(`/campaigns/${campaignId}/logo`);
  return data;
};

export const getCampaign = async (id: string) => {
  const { data } = await api.get<Campaign>(`/campaigns/${id}`);
  return data;
};

export const generateCampaign = async (
  campaignId: string,
  payload: GenerateRequest,
) => {
  const { data } = await api.post<Run>(
    `/campaigns/${campaignId}/generate`,
    payload,
  );
  return data;
};

export const getRun = async (runId: string) => {
  const { data } = await api.get<Run>(`/runs/${runId}`);
  return data;
};

/** Poll a run until terminal status, invoking onUpdate each tick. */
export const pollRun = async (
  runId: string,
  onUpdate?: (run: Run) => void,
  intervalMs = 2500,
): Promise<Run> => {
  for (;;) {
    const run = await getRun(runId);
    onUpdate?.(run);
    if (
      run.status === "succeeded" ||
      run.status === "failed" ||
      run.status === "storyboard"
    ) {
      return run;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

export const remixRun = async (runId: string, payload: RemixRequest) => {
  const { data } = await api.post<Run>(`/runs/${runId}/remix`, payload);
  return data;
};

export const listAssets = async (campaignId: string) => {
  const { data } = await api.get<Asset[]>(`/campaigns/${campaignId}/assets`);
  return data;
};

export const listAllAssets = async (opts: {
  page?: number;
  pageSize?: number;
  campaignId?: string | null;
  runId?: string | null;
} = {}) => {
  const { page = 1, pageSize = 12, campaignId, runId } = opts;
  const { data } = await api.get<AssetPage>("/assets", {
    params: {
      page,
      page_size: pageSize,
      ...(campaignId ? { campaign_id: campaignId } : {}),
      ...(runId ? { run_id: runId } : {}),
    },
  });
  return data;
};

export const getAssetUrl = async (assetId: string) => {
  const { data } = await api.get<PresignedUrl>(`/assets/${assetId}/url`);
  return data;
};

export const downloadAssetBlob = async (assetId: string): Promise<Blob> => {
  const { data, headers } = await api.get<Blob>(`/assets/${assetId}/download`, {
    responseType: "blob",
  });
  const ctype = String(headers["content-type"] || "");
  if (ctype.includes("application/json")) {
    const parsed = JSON.parse(await data.text()) as { detail?: string };
    throw new Error(parsed.detail || "Download failed");
  }
  return data;
};

export const getProvenance = async (assetId: string) => {
  const { data } = await api.get<Provenance>(`/assets/${assetId}/provenance`);
  return data;
};

export const verifyAsset = async (assetId: string) => {
  const { data } = await api.post<VerifyResult>(`/assets/${assetId}/verify`);
  return data;
};

export const approveAsset = async (assetId: string) => {
  const { data } = await api.post<Asset>(`/assets/${assetId}/approve`);
  return data;
};

export const deleteAsset = async (assetId: string): Promise<void> => {
  await api.delete(`/assets/${assetId}`);
};

export const getStoryboard = async (runId: string) => {
  const { data } = await api.get<Storyboard>(`/runs/${runId}/storyboard`);
  return data;
};

export const updateStoryboardScene = async (
  runId: string,
  sceneIndex: number,
  prompt: string,
) => {
  const { data } = await api.patch<Storyboard>(
    `/runs/${runId}/storyboard/scenes/${sceneIndex}`,
    { prompt },
  );
  return data;
};

export const regenerateStoryboardScene = async (
  runId: string,
  sceneIndex: number,
) => {
  const { data } = await api.post<Storyboard>(
    `/runs/${runId}/storyboard/scenes/${sceneIndex}/regenerate`,
  );
  return data;
};

export const finalizeStoryboard = async (runId: string) => {
  const { data } = await api.post<Run>(`/runs/${runId}/storyboard/finalize`);
  return data;
};

export const getProvidersStatus = async () => {
  const { data } = await api.get("/providers/status");
  return data;
};
