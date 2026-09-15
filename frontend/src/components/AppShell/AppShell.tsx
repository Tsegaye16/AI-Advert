import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Button, Skeleton, Tooltip } from "antd";
import {
  AppstoreOutlined,
  DashboardOutlined,
  FolderOpenOutlined,
  MenuOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { ErrorBoundary } from "../ErrorBoundary/ErrorBoundary";
import { PageTitleContext } from "./pageTitleContext";
import { ThemeToggle } from "./ThemeToggle";
import { SystemStatusBadge } from "./SystemStatusBadge";

function RouteFallback() {
  return (
    <div className="stack" aria-busy="true">
      <Skeleton active paragraph={{ rows: 2 }} title={{ width: 260 }} />
      <Skeleton active paragraph={{ rows: 4 }} />
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: <DashboardOutlined />, end: true },
  { to: "/campaigns", label: "Campaigns", icon: <FolderOpenOutlined /> },
  { to: "/runs", label: "Runs", icon: <ThunderboltOutlined /> },
  { to: "/assets", label: "Assets", icon: <PictureOutlined /> },
];

const SECONDARY_NAV: NavItem[] = [
  { to: "/verify", label: "Verify", icon: <SafetyCertificateOutlined /> },
  { to: "/settings", label: "Settings", icon: <SettingOutlined /> },
];

function BrandMark() {
  return (
    <span className="app-brand__mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3 19 5.6v4.9c0 4-2.8 7-7 8.4-4.2-1.4-7-4.4-7-8.4V5.6L12 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="m9.2 11.9 2 2 3.7-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function AppShell() {
  const [title, setTitle] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const setTitleStable = useCallback((next: string) => setTitle(next), []);
  const titleValue = useMemo(
    () => ({ title, setTitle: setTitleStable }),
    [title, setTitleStable],
  );

  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className="app-nav__item">
        {item.icon}
        <span>{item.label}</span>
      </NavLink>
    ));

  return (
    <PageTitleContext.Provider value={titleValue}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="app-shell">
        {navOpen ? (
          <div
            className="app-sidebar__scrim"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <aside className="app-sidebar" data-open={navOpen} aria-label="Main navigation">
          <Link to="/" className="app-brand">
            <BrandMark />
            <span className="app-brand__name">AdVault</span>
          </Link>

          <nav className="app-nav" aria-label="Primary">
            {renderNav(PRIMARY_NAV)}
            <span className="app-nav__label">Provenance</span>
            {renderNav(SECONDARY_NAV)}
          </nav>

          <div className="app-sidebar__footer">
            <SystemStatusBadge />
          </div>
        </aside>

        <header className="app-topbar">
          <Button
            className="app-topbar__menu-btn"
            type="text"
            icon={<MenuOutlined />}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          />
          <h1 className="app-topbar__title">{title}</h1>
          <div className="app-topbar__spacer" />
          <div className="app-topbar__actions">
            <Tooltip title="New campaign">
              <Link to="/campaigns/new">
                <Button type="primary" icon={<AppstoreOutlined />}>
                  New campaign
                </Button>
              </Link>
            </Tooltip>
            <ThemeToggle />
          </div>
        </header>

        <main className="app-main" id="main-content" tabIndex={-1}>
          <div className="app-main__inner">
            <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </PageTitleContext.Provider>
  );
}
