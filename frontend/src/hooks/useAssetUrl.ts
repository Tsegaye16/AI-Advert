import { useCallback, useEffect, useRef, useState } from "react";
import { getAssetUrl } from "../services/api";
import type { Asset } from "../types";

interface CacheEntry {
  url: string;
  expiresAt: number;
  inflight?: Promise<string>;
}

const cache = new Map<string, CacheEntry>();

/** Refresh once 80% of the presign TTL has elapsed, so URLs never expire in place. */
const REFRESH_RATIO = 0.8;
const MIN_TTL_MS = 30_000;

function isFresh(entry: CacheEntry | undefined): boolean {
  return !!entry && entry.expiresAt > Date.now();
}

export async function resolveAssetUrl(assetId: string): Promise<string> {
  const entry = cache.get(assetId);
  if (entry && isFresh(entry)) return entry.url;
  if (entry?.inflight) return entry.inflight;

  const inflight = getAssetUrl(assetId).then(({ url, expires_in }) => {
    const ttlMs = Math.max((expires_in || 900) * 1000 * REFRESH_RATIO, MIN_TTL_MS);
    cache.set(assetId, { url, expiresAt: Date.now() + ttlMs });
    return url;
  });

  cache.set(assetId, {
    url: entry?.url ?? "",
    expiresAt: 0,
    inflight,
  });

  try {
    return await inflight;
  } catch (err) {
    cache.delete(assetId);
    throw err;
  }
}

export function invalidateAssetUrl(assetId: string) {
  cache.delete(assetId);
}

/**
 * Presigned B2 URLs expire (default 15 min). This keeps one alive for as long
 * as the component is mounted so long-lived tabs never show broken media.
 */
export function useAssetUrl(asset: Pick<Asset, "id" | "b2_key" | "url">) {
  const [url, setUrl] = useState<string | null>(() => {
    const entry = cache.get(asset.id);
    return entry && isFresh(entry) ? entry.url : asset.url;
  });
  const [loading, setLoading] = useState(!url);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (mounted: () => boolean) => {
      if (!asset.b2_key) {
        setLoading(false);
        return;
      }
      try {
        const fresh = await resolveAssetUrl(asset.id);
        if (!mounted()) return;
        setUrl(fresh);
        setError(null);

        const entry = cache.get(asset.id);
        const delay = entry ? Math.max(entry.expiresAt - Date.now(), MIN_TTL_MS) : MIN_TTL_MS;
        timer.current = setTimeout(() => void load(mounted), delay);
      } catch (err) {
        if (!mounted()) return;
        setError(err instanceof Error ? err.message : "Could not load media URL");
        setUrl(asset.url);
      } finally {
        if (mounted()) setLoading(false);
      }
    },
    [asset.id, asset.b2_key, asset.url],
  );

  useEffect(() => {
    let alive = true;
    const mounted = () => alive;
    void load(mounted);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { url, loading, error };
}
