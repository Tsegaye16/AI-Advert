import { useCallback, useRef, useState } from "react";

const PREFIX = "advault.draft.";

/**
 * Persists in-progress form values to localStorage so a refresh or accidental
 * navigation doesn't discard a long brief.
 */
export function useFormDraft<T extends object>(key: string, fallback: T) {
  const storageKey = `${PREFIX}${key}`;

  const [draft] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
    } catch {
      return fallback;
    }
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (values: Partial<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(values));
        } catch {
          /* quota or private mode — drafts are a convenience, not a requirement */
        }
      }, 400);
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return { draft, save, clear };
}
