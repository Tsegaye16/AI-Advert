import { createContext, useContext } from "react";
import type { Density, ThemeMode } from "./antdTheme";

export type ThemePreference = ThemeMode | "system";

export interface ThemeContextValue {
  /** What the user picked, including "system". */
  preference: ThemePreference;
  /** What is actually rendered right now. */
  mode: ThemeMode;
  density: Density;
  setPreference: (preference: ThemePreference) => void;
  setDensity: (density: Density) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
