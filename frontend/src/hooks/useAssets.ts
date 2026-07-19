import { useCallback, useEffect, useRef, useState } from "react";
import { listAllAssets } from "../services/api";
import type { Asset } from "../types";

const DEFAULT_PAGE_SIZE = 12;

export function useAssets(
  campaignId: string | undefined | null,
  runId?: string | null,
) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGen = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [campaignId, runId]);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const gen = ++fetchGen.current;
      setLoading(true);
      setError(null);
      try {
        const data = await listAllAssets({
          page: targetPage,
          pageSize,
          campaignId: campaignId || undefined,
          runId: runId || undefined,
        });
        if (gen !== fetchGen.current) return;
        setAssets(data.items);
        setTotal(data.total);
      } catch (err) {
        if (gen !== fetchGen.current) return;
        setError(err instanceof Error ? err.message : "Failed to load assets");
      } finally {
        if (gen === fetchGen.current) setLoading(false);
      }
    },
    [campaignId, runId, pageSize],
  );

  useEffect(() => {
    void fetchPage(page);
  }, [fetchPage, page]);

  const refreshFromStart = useCallback(() => {
    if (page === 1) {
      void fetchPage(1);
    } else {
      setPage(1);
    }
  }, [fetchPage, page]);

  return {
    assets,
    total,
    page,
    pageSize,
    setPage,
    loading,
    error,
    refreshFromStart,
  };
}
