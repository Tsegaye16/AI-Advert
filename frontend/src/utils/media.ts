import type { Asset } from "../types";

export type MediaKind = "image" | "video" | "audio" | "unknown";

export function mediaKindOf(asset: Pick<Asset, "mime" | "kind">): MediaKind {
  const mime = (asset.mime || "").toLowerCase();
  if (mime.startsWith("video/") || asset.kind === "video" || asset.kind === "final")
    return "video";
  if (mime.startsWith("audio/") || asset.kind === "audio") return "audio";
  if (mime.startsWith("image/") || asset.kind === "image") return "image";
  return "unknown";
}

/**
 * Frame ratio comes from the asset's real dimensions so nothing is ever cropped.
 * Falls back to per-kind defaults when the backend didn't record them.
 */
export function aspectFor(asset: Asset, kind: MediaKind): string {
  if (asset.width && asset.height && asset.width > 0 && asset.height > 0) {
    return `${asset.width} / ${asset.height}`;
  }
  if (kind === "video") return "16 / 9";
  if (kind === "audio") return "3 / 1";
  return "4 / 3";
}
