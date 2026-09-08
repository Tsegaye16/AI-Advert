import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth } from "../services/api";
import type { HealthStatus } from "../types";

const POLL_MS = 60_000;

/** Backend liveness for the shell status badge. Pauses while the tab is hidden. */
export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    try {
      setHealth(await getHealth());
      setReachable(true);
    } catch {
      setReachable(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, POLL_MS);
    };

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await check();
      schedule();
    };

    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  return { health, reachable, refresh: check };
}
