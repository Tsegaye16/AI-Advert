import { theme } from "antd";
import type { ThemeConfig } from "antd";
import {
  darkSurfaces,
  fontFamily,
  fontFamilyMono,
  fontSize,
  palette,
  radius,
  space,
} from "./tokens";

export type ThemeMode = "light" | "dark";
export type Density = "comfortable" | "compact";

function baseTokens(mode: ThemeMode): ThemeConfig["token"] {
  const isDark = mode === "dark";

  return {
    colorPrimary: isDark ? palette.brand[500] : palette.brand[600],
    colorInfo: isDark ? palette.brand[500] : palette.brand[600],
    colorSuccess: isDark ? darkSurfaces.success : palette.success,
    colorWarning: isDark ? darkSurfaces.warning : palette.warning,
    colorError: isDark ? darkSurfaces.danger : palette.danger,
    colorLink: isDark ? palette.brand[400] : palette.brand[600],

    colorBgBase: isDark ? darkSurfaces.canvas : palette.neutral[0],
    colorBgContainer: isDark ? darkSurfaces.surface : palette.neutral[0],
    colorBgElevated: isDark ? darkSurfaces.subtle : palette.neutral[0],
    colorBgLayout: isDark ? darkSurfaces.canvas : palette.neutral[50],
    colorBgSpotlight: isDark ? darkSurfaces.subtle : palette.neutral[800],

    colorText: isDark ? darkSurfaces.textPrimary : palette.neutral[900],
    colorTextSecondary: isDark ? darkSurfaces.textSecondary : palette.neutral[600],
    colorTextTertiary: isDark ? darkSurfaces.textTertiary : palette.neutral[500],
    colorTextQuaternary: isDark ? "#5a6478" : palette.neutral[400],

    colorBorder: isDark ? darkSurfaces.borderDefault : palette.neutral[300],
    colorBorderSecondary: isDark ? darkSurfaces.borderSubtle : palette.neutral[200],
    colorSplit: isDark ? darkSurfaces.borderSubtle : palette.neutral[200],

    fontFamily,
    fontFamilyCode: fontFamilyMono,
    fontSize: fontSize.base,
    fontSizeSM: fontSize.xs,
    fontSizeLG: fontSize.lg,
    fontSizeXL: fontSize.xl,
    fontSizeHeading1: 30,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    fontSizeHeading5: 15,
    lineHeight: 1.55,
    lineHeightHeading1: 1.25,
    lineHeightHeading2: 1.3,
    lineHeightHeading3: 1.35,

    borderRadius: radius.md,
    borderRadiusXS: radius.xs,
    borderRadiusSM: radius.sm,
    borderRadiusLG: radius.lg,

    controlHeight: 36,
    controlHeightSM: 28,
    controlHeightLG: 44,

    paddingXXS: space[1],
    paddingXS: space[2],
    paddingSM: space[3],
    padding: space[4],
    paddingMD: space[5],
    paddingLG: space[6],
    paddingXL: space[7],
    margin: space[4],
    marginXS: space[2],
    marginSM: space[3],
    marginLG: space[6],

    wireframe: false,
    motionDurationFast: "0.12s",
    motionDurationMid: "0.18s",
    motionDurationSlow: "0.28s",
    motionEaseInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    motionEaseOut: "cubic-bezier(0.16, 1, 0.3, 1)",

    boxShadow: isDark
      ? "0 4px 8px -2px rgba(0,0,0,0.5), 0 2px 4px -2px rgba(0,0,0,0.3)"
      : "0 4px 8px -2px rgba(16,24,40,0.08), 0 2px 4px -2px rgba(16,24,40,0.04)",
    boxShadowSecondary: isDark
      ? "0 12px 16px -4px rgba(0,0,0,0.55), 0 4px 6px -2px rgba(0,0,0,0.3)"
      : "0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03)",
    boxShadowTertiary: isDark
      ? "0 1px 2px rgba(0,0,0,0.4)"
      : "0 1px 2px rgba(16,24,40,0.05)",
  };
}

function componentTokens(mode: ThemeMode): ThemeConfig["components"] {
  const isDark = mode === "dark";
  const surface = isDark ? darkSurfaces.surface : palette.neutral[0];
  const subtle = isDark ? darkSurfaces.subtle : palette.neutral[100];
  const borderSubtle = isDark ? darkSurfaces.borderSubtle : palette.neutral[200];

  return {
    Button: {
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      paddingInline: space[4],
      contentFontSize: fontSize.base,
    },
    Card: {
      headerBg: "transparent",
      headerFontSize: fontSize.lg,
      paddingLG: space[6],
      borderRadiusLG: radius.lg,
    },
    Layout: {
      headerBg: surface,
      headerHeight: 56,
      headerPadding: `0 ${space[6]}px`,
      bodyBg: isDark ? darkSurfaces.canvas : palette.neutral[50],
      siderBg: surface,
    },
    Menu: {
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemSelectedBg: isDark ? "rgba(99,102,241,0.14)" : palette.brand[50],
      itemSelectedColor: isDark ? palette.brand[300] : palette.brand[700],
      itemHoverBg: isDark ? "rgba(255,255,255,0.05)" : palette.neutral[100],
      itemHeight: 36,
      itemBorderRadius: radius.sm,
      itemMarginInline: space[2],
      iconMarginInlineEnd: space[3],
      collapsedIconSize: 16,
    },
    Input: {
      paddingBlock: 6,
      paddingInline: space[3],
    },
    Select: {
      optionSelectedBg: isDark ? "rgba(99,102,241,0.16)" : palette.brand[50],
      optionActiveBg: isDark ? "rgba(255,255,255,0.05)" : palette.neutral[100],
      optionPadding: `6px ${space[3]}px`,
    },
    Modal: {
      contentBg: surface,
      headerBg: "transparent",
      titleFontSize: fontSize.xl,
      borderRadiusLG: radius.lg,
      paddingContentHorizontalLG: space[6],
    },
    Table: {
      headerBg: subtle,
      headerColor: isDark ? darkSurfaces.textSecondary : palette.neutral[600],
      headerSplitColor: "transparent",
      rowHoverBg: isDark ? "rgba(255,255,255,0.03)" : palette.neutral[50],
      borderColor: borderSubtle,
      cellPaddingBlock: space[3],
    },
    Tag: {
      defaultBg: subtle,
      defaultColor: isDark ? darkSurfaces.textSecondary : palette.neutral[700],
      borderRadiusSM: radius.xs,
      lineHeightSM: 1.6,
    },
    Alert: {
      borderRadiusLG: radius.md,
      withDescriptionPadding: `${space[3]}px ${space[4]}px`,
      defaultPadding: `${space[2]}px ${space[3]}px`,
    },
    Segmented: {
      trackBg: subtle,
      trackPadding: 3,
      itemSelectedBg: surface,
      itemSelectedColor: isDark ? darkSurfaces.textPrimary : palette.neutral[900],
      itemHoverBg: "transparent",
      borderRadius: radius.sm,
    },
    Steps: {
      iconSize: 26,
      iconFontSize: fontSize.xs,
      titleLineHeight: 1.4,
      descriptionMaxWidth: 180,
    },
    Progress: {
      defaultColor: isDark ? palette.brand[500] : palette.brand[600],
      remainingColor: isDark ? "rgba(255,255,255,0.08)" : palette.neutral[200],
      lineBorderRadius: 999,
    },
    Tooltip: {
      borderRadius: radius.sm,
      colorBgSpotlight: isDark ? "#242a37" : palette.neutral[800],
    },
    Form: {
      labelColor: isDark ? darkSurfaces.textSecondary : palette.neutral[700],
      labelFontSize: fontSize.sm,
      itemMarginBottom: space[5],
      verticalLabelPadding: `0 0 ${space[1]}px`,
    },
    Tabs: {
      itemColor: isDark ? darkSurfaces.textSecondary : palette.neutral[600],
      itemSelectedColor: isDark ? darkSurfaces.textPrimary : palette.neutral[900],
      inkBarColor: isDark ? palette.brand[400] : palette.brand[600],
      horizontalItemPadding: `${space[3]}px 0`,
      horizontalItemGutter: space[6],
      titleFontSize: fontSize.base,
    },
    Divider: {
      colorSplit: borderSubtle,
      marginLG: space[6],
    },
    Drawer: {
      footerPaddingBlock: space[4],
      footerPaddingInline: space[6],
    },
    Descriptions: {
      labelBg: subtle,
      titleMarginBottom: space[3],
      itemPaddingBottom: space[3],
    },
    Upload: {
      actionsColor: isDark ? darkSurfaces.textSecondary : palette.neutral[500],
    },
    Empty: {
      colorTextDescription: isDark ? darkSurfaces.textTertiary : palette.neutral[500],
    },
    Timeline: {
      dotBg: surface,
      tailColor: borderSubtle,
    },
    Popover: {
      titleMinWidth: 200,
    },
    Notification: {
      paddingContentHorizontalLG: space[4],
    },
  };
}

export function buildTheme(mode: ThemeMode, density: Density): ThemeConfig {
  const algorithms =
    mode === "dark" ? [theme.darkAlgorithm] : [theme.defaultAlgorithm];
  if (density === "compact") algorithms.push(theme.compactAlgorithm);

  return {
    algorithm: algorithms,
    cssVar: { key: "advault" },
    token: baseTokens(mode),
    components: componentTokens(mode),
  };
}
