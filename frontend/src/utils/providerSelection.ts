export interface ProviderSelectionValues {
  image_vendor?: string;
  image_model?: string;
  video_vendor?: string;
  video_model?: string;
  tts_vendor?: string;
  tts_model?: string;
  music_vendor?: string;
  music_model?: string;
}

const SLOT_FIELDS = [
  ["image", "image_vendor", "image_model"],
  ["video", "video_vendor", "video_model"],
  ["tts", "tts_vendor", "tts_model"],
  ["music", "music_vendor", "music_model"],
] as const;

export function buildSelectionPayload(values: ProviderSelectionValues) {
  const selection: Record<string, { vendor?: string; model?: string }> = {};
  for (const [slot, vendorKey, modelKey] of SLOT_FIELDS) {
    const vendor = values[vendorKey];
    const model = values[modelKey];
    if (vendor || model) {
      selection[slot] = {
        ...(vendor ? { vendor } : {}),
        ...(model ? { model } : {}),
      };
    }
  }
  return Object.keys(selection).length ? selection : undefined;
}
