import { downloadAssetBlob } from "../services/api";
import type { Asset } from "../types";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "application/json": ".json",
};

export function filenameForAsset(asset: Asset): string {
  const mime = (asset.mime || "").split(";")[0].trim().toLowerCase();
  let ext = EXT_BY_MIME[mime] || "";
  if (!ext && asset.b2_key) {
    const tail = asset.b2_key.split("/").pop() || "";
    if (tail.includes(".")) ext = `.${tail.split(".").pop()}`;
  }
  const step = (asset.step_name || asset.kind).replace(/[^a-z0-9-_]+/gi, "-");
  return `advault-${step}-${asset.id.slice(0, 8)}${ext}`;
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadAsset(asset: Asset): Promise<void> {
  const blob = await downloadAssetBlob(asset.id);
  saveBlob(blob, filenameForAsset(asset));
}

export function downloadJson(data: unknown, filename: string): void {
  saveBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename,
  );
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
