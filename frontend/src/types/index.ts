export type RunMode = "quick" | "full";
export type RunStatus =
  | "queued"
  | "running"
  | "storyboard"
  | "succeeded"
  | "failed";
export type AssetKind =
  | "image"
  | "video"
  | "audio"
  | "final"
  | "manifest"
  | "other";

export interface Campaign {
  id: string;
  name: string;
  product_name: string;
  product_description: string;
  audience: string;
  tone: string;
  cta: string;
  brand_colors: string[];
  logo_b2_key: string | null;
  brief: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignCreate {
  name: string;
  product_name: string;
  product_description?: string;
  audience?: string;
  tone?: string;
  cta?: string;
  brand_colors?: string[];
  brief?: string;
}

export interface StepStatus {
  name: string;
  status: string;
  provider?: string;
  model?: string;
  fallback_used?: boolean;
  error?: string | null;
}

export interface Asset {
  id: string;
  run_id: string;
  campaign_id: string;
  kind: AssetKind;
  step_name: string;
  provider: string;
  model: string;
  b2_key: string | null;
  url: string | null;
  sha256: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  approved: number;
  created_at: string;
}

export interface AssetPage {
  items: Asset[];
  total: number;
  page: number;
  page_size: number;
}

export interface Run {
  id: string;
  campaign_id: string;
  mode: RunMode;
  status: RunStatus;
  parent_run_id: string | null;
  prompt_snapshot: Record<string, string>;
  steps: StepStatus[];
  error: string | null;
  manifest_b2_key: string | null;
  canonical_hash: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  assets: Asset[];
}

export interface GenerateRequest {
  mode: RunMode;
  prompt_override?: string;
  voiceover_script?: string;
  music_prompt?: string;
  storyboard?: boolean;
  scene_count?: number;
  selection?: ProviderSelection;
}

export interface ProviderChoice {
  vendor?: string;
  model?: string;
}

export interface ProviderSelection {
  image?: ProviderChoice;
  video?: ProviderChoice;
  tts?: ProviderChoice;
  music?: ProviderChoice;
}

export interface RemixRequest {
  prompt_override: string;
  mode?: RunMode;
  voiceover_script?: string;
}

export interface Provenance {
  asset_id: string;
  run_id: string;
  canonical_hash: string | null;
  manifest_b2_key: string | null;
  steps: StepStatus[];
  providers: string[];
  models: string[];
  parent_run_id: string | null;
  manifest?: Record<string, unknown> | null;
}

export interface VerifyResult {
  asset_id: string;
  verified: boolean;
  manifest_ok: boolean;
  byte_match: boolean | null;
  canonical_hash: string | null;
  expected_sha256: string | null;
  actual_sha256: string | null;
  detail: string;
}

export interface PresignedUrl {
  url: string;
  expires_in: number;
  b2_key: string | null;
}

export interface StoryboardScene {
  index: number;
  title: string;
  voice_line: string;
  prompt: string;
  asset_id: string | null;
  status: string;
  image_url: string | null;
}

export interface Storyboard {
  run_id: string;
  status: string;
  scenes: StoryboardScene[];
  voiceover: string;
  ready: boolean;
}
