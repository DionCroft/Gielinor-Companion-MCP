import type { ReactNode } from "react";

import type { AppState, ViewId } from "../state/app-state.js";
import type { IconName } from "./Icon.js";
import { Icon } from "./Icon.js";

const NAVIGATION: Array<{
  label: string;
  items: Array<{ id: ViewId; label: string; icon: IconName }>;
}> = [
  {
    label: "Companion",
    items: [
      { id: "dashboard", label: "Overview", icon: "dashboard" },
      { id: "profiles", label: "Player profiles", icon: "profiles" },
      { id: "skills", label: "Skills", icon: "skills" },
    ],
  },
  {
    label: "Plan",
    items: [
      { id: "quests", label: "Quest planner", icon: "quests" },
      { id: "levelling", label: "Levelling", icon: "levelling" },
      { id: "exchange", label: "Grand Exchange", icon: "exchange" },
      { id: "shopping", label: "Shopping lists", icon: "shopping" },
      { id: "goals", label: "Goals", icon: "goals" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "data-status", label: "Data sources", icon: "status" },
      { id: "updates", label: "Updates", icon: "updates" },
      { id: "settings", label: "Settings", icon: "settings" },
      { id: "ai-providers", label: "AI providers", icon: "spark" },
      { id: "about", label: "About", icon: "about" },
    ],
  },
];

export function Layout({
  state,
  selectedProfileName,
  onNavigate,
  onToggleSidebar,
  children,
}: {
  state: AppState;
  selectedProfileName?: string;
  onNavigate: (view: ViewId) => void;
  onToggleSidebar: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "app-shell",
        `theme-${state.theme}`,
        state.compactMode ? "compact-mode" : "",
        state.sidebarOpen ? "sidebar-is-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <div>
            <strong>Gielinor</strong>
            <span>Companion</span>
          </div>
        </div>
        <nav>
          {NAVIGATION.map((group) => (
            <section className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={state.activeView === item.id ? "nav-item active" : "nav-item"}
                  aria-current={state.activeView === item.id ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {state.activeView === item.id ? <i className="nav-indicator" /> : null}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`runtime-dot ${state.runtime?.ready === true ? "ready" : ""}`} />
          <div>
            <strong>{state.offlineMode ? "Offline mode" : "Local runtime"}</strong>
            <span>{state.runtime?.ready === true ? "Ready" : "Checking…"}</span>
          </div>
        </div>
      </aside>
      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="Close navigation"
        onClick={onToggleSidebar}
      />
      <div className="app-stage">
        <header className="topbar">
          <button
            type="button"
            className="icon-button menu-button"
            aria-label="Open navigation"
            onClick={onToggleSidebar}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-context">
            <span className="live-pulse" aria-hidden="true" />
            <span>{state.offlineMode ? "Using retained local data" : "Read-only companion"}</span>
          </div>
          <div className="topbar-profile">
            <span className="avatar">{selectedProfileName?.slice(0, 1).toUpperCase() ?? "?"}</span>
            <div>
              <strong>{selectedProfileName ?? "No profile"}</strong>
              <span>No credentials stored</span>
            </div>
          </div>
        </header>
        {state.notice === undefined ? null : (
          <div className={`global-notice notice-${state.notice.tone}`} role="status">
            <span>{state.notice.message}</span>
          </div>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
