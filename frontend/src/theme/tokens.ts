/**
 * TypeScript mirror of src/styles/tokens.css.
 * Keep both files in sync — CSS drives layout, this drives Ant Design.
 */

export const palette = {
  brand: {
    50: "#eef2ff",
    100: "#e0e7ff",
    200: "#c7d2fe",
    300: "#a5b4fc",
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    800: "#3730a3",
    900: "#312e81",
  },
  neutral: {
    0: "#ffffff",
    25: "#fcfcfd",
    50: "#f9fafb",
    100: "#f2f4f7",
    200: "#e4e7ec",
    300: "#d0d5dd",
    400: "#98a2b3",
    500: "#667085",
    600: "#475467",
    700: "#344054",
    800: "#1d2939",
    900: "#101828",
    950: "#0b0e14",
  },
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
} as const;

export const darkSurfaces = {
  canvas: "#0b0e14",
  surface: "#12161f",
  subtle: "#1a1f2b",
  borderSubtle: "#222836",
  borderDefault: "#2d3545",
  textPrimary: "#e7eaf0",
  textSecondary: "#9aa4b8",
  textTertiary: "#78839a",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
} as const;

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 64,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const fontFamily =
  '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const fontFamilyMono =
  '"IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
} as const;
