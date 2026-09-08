import { useCallback, useEffect, useRef, useState } from "react";
import { getRun } from "../services/api";
import type { Run } from "../types";

const TERMINAL = new Set(["succeeded", "failed", "storyboard", "cancelled"]);

const BASE_INTERVAL = 2000;
const MAX_INTERVAL = 15000;

/**
 * Polls a run until it reaches a terminal state.
 * Backs off progressively, pauses while the tab is hidden, and resumes on focus
 * so a long render doesn't hammer the API or silently stall.
 */
export function useRun(runId: string | null | undefined) {
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(!!runId);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef(BASE_INTERVAL);
  const alive = useRef(true);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const fetchOnce = useCallback(async (): Promise<Run | null> => {
    if (!runId) return null;
    const next = await getRun(runId);
    if (!alive.current) return null;
    setRun(next);
    setError(null);
    return next;
  }, [runId]);

  const refresh = useCallback(async () => {
    try {
      await fetchOnce();
    } catch (err) {
      if (alive.current) {
        setError(err instanceof Error ? err.message : "Could not load run");
      }
    }
  }, [fetchOnce]);

  useEffect(() => {
    alive.current = true;
    interval.current = BASE_INTERVAL;
    if (!runId) {
      setRun(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const schedule = () => {
      clear();
      timer.current = setTimeout(tick, interval.current);
    };

    const tick = async () => {
      if (!alive.current) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      try {
        const next = await fetchOnce();
        if (!alive.current) return;
        if (next && TERMINAL.has(next.status)) {
          clear();
          return;
        }
        interval.current = Math.min(interval.current * 1.35, MAX_INTERVAL);
      } catch (err) {
        if (!alive.current) return;
        setError(err instanceof Error ? err.message : "Could not load run");
        interval.current = Math.min(interval.current * 2, MAX_INTERVAL);
      } finally {
        if (alive.current) setLoading(false);
      }
      schedule();
    };

    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible" && alive.current) {
        interval.current = BASE_INTERVAL;
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive.current = false;
      clear();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runId, fetchOnce]);

  return { run, setRun, loading, error, refresh };
}
