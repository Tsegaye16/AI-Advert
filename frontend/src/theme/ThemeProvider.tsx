import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { App as AntApp, ConfigProvider } from "antd";
import { buildTheme } from "./antdTheme";
import type { Density, ThemeMode } from "./antdTheme";
import { ThemeContext } from "./themeContext";
import type { ThemePreference } from "./themeContext";

const THEME_KEY = "advault.theme";
const DENSITY_KEY = "advault.density";

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function readPreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function readDensity(): Density {
  if (typeof localStorage === "undefined") return "comfortable";
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [density, setDensityState] = useState<Density>(readDensity);
  const [systemMode, setSystemMode] = useState<ThemeMode>(() =>
    prefersDark() ? "dark" : "light",
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) =>
      setSystemMode(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const mode: ThemeMode = preference === "system" ? systemMode : preference;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", mode === "dark" ? "#0b0e14" : "#ffffff");
  }, [mode]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    localStorage.setItem(THEME_KEY, next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    localStorage.setItem(DENSITY_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ preference, mode, density, setPreference, setDensity }),
    [preference, mode, density, setPreference, setDensity],
  );

  const antdTheme = useMemo(() => buildTheme(mode, density), [mode, density]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={antdTheme}
        componentSize={density === "compact" ? "small" : "middle"}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
