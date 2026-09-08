import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  CheckOutlined,
  DesktopOutlined,
  MoonOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import { useTheme } from "../../theme/themeContext";
import type { ThemePreference } from "../../theme/themeContext";

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match system",
};

export function ThemeToggle() {
  const { preference, mode, density, setPreference, setDensity } = useTheme();

  const items: MenuProps["items"] = [
    { key: "group-theme", type: "group", label: "Appearance" },
    ...(["light", "dark", "system"] as ThemePreference[]).map((value) => ({
      key: value,
      label: LABELS[value],
      icon:
        value === "light" ? (
          <SunOutlined />
        ) : value === "dark" ? (
          <MoonOutlined />
        ) : (
          <DesktopOutlined />
        ),
      extra: preference === value ? <CheckOutlined /> : undefined,
      onClick: () => setPreference(value),
    })),
    { type: "divider" },
    { key: "group-density", type: "group", label: "Density" },
    {
      key: "comfortable",
      label: "Comfortable",
      extra: density === "comfortable" ? <CheckOutlined /> : undefined,
      onClick: () => setDensity("comfortable"),
    },
    {
      key: "compact",
      label: "Compact",
      extra: density === "compact" ? <CheckOutlined /> : undefined,
      onClick: () => setDensity("compact"),
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <Tooltip title="Appearance">
        <Button
          type="text"
          aria-label={`Appearance settings, currently ${LABELS[preference].toLowerCase()}`}
          icon={mode === "dark" ? <MoonOutlined /> : <SunOutlined />}
        />
      </Tooltip>
    </Dropdown>
  );
}
