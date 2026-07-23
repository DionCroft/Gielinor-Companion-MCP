import { useEffect, useState } from "react";

import { InlineAlert, LoadingBlock, PageHeader, StatusPill } from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { formatDate, formatNumber, titleCase } from "../lib/format.js";
import type { ThemePreference } from "../state/app-state.js";
import type { CompanionBridge, DataStatus, RuntimeStatus } from "../types.js";

type SourceKey = "quests" | "training" | "prices";

const SOURCE_DETAILS: Record<
  SourceKey,
  { title: string; description: string; statusTool: string; refreshTool: string }
> = {
  quests: {
    title: "Quest catalogue",
    description: "Revision-aware RuneScape Wiki quest facts and dependencies.",
    statusTool: "get_quest_data_status",
    refreshTool: "refresh_quest_data",
  },
  training: {
    title: "Training methods",
    description: "Structured Wiki guide rates and uncertainty for all 29 skills.",
    statusTool: "get_training_data_status",
    refreshTool: "refresh_training_data",
  },
  prices: {
    title: "Grand Exchange",
    description: "Search catalogue, Jagex guide-price history and freshness.",
    statusTool: "get_price_data_status",
    refreshTool: "refresh_price_data",
  },
};

export function DataStatusView({
  bridge,
  offlineMode,
}: {
  bridge: CompanionBridge;
  offlineMode: boolean;
}) {
  const [statuses, setStatuses] = useState<Partial<Record<SourceKey, DataStatus>>>({});
  const [busy, setBusy] = useState<SourceKey>();
  const [error, setError] = useState<string>();

  async function load() {
    setError(undefined);
    try {
      const entries = await Promise.all(
        (
          Object.entries(SOURCE_DETAILS) as Array<[SourceKey, (typeof SOURCE_DETAILS)[SourceKey]]>
        ).map(
          async ([key, detail]) =>
            [key, (await bridge.callTool<DataStatus>(detail.statusTool, {})).data] as const,
        ),
      );
      setStatuses(Object.fromEntries(entries));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Data-source status could not be loaded");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refresh(key: SourceKey) {
    if (offlineMode) {
      setError("Offline mode is enabled. Retained validated data remains available.");
      return;
    }
    setBusy(key);
    setError(undefined);
    try {
      await bridge.callTool(SOURCE_DETAILS[key].refreshTool, {});
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The provider refresh failed");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Provider health"
        title="Data sources"
        description="See exactly what is local, when it was refreshed, and whether retained data is stale."
        actions={
          <button className="secondary-button" type="button" onClick={() => void load()}>
            <Icon name="refresh" />
            Recheck status
          </button>
        }
      />
      {offlineMode ? (
        <InlineAlert tone="info">
          Offline mode is active. Read-only views use the last validated local snapshots.
        </InlineAlert>
      ) : null}
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      {Object.keys(statuses).length === 0 && error === undefined ? (
        <LoadingBlock label="Checking local data sources" />
      ) : (
        <section className="source-card-grid">
          {(
            Object.entries(SOURCE_DETAILS) as Array<[SourceKey, (typeof SOURCE_DETAILS)[SourceKey]]>
          ).map(([key, detail]) => {
            const status = statuses[key];
            const count = status?.questCount ?? status?.methodCount ?? status?.itemCount ?? 0;
            return (
              <article className="source-card" key={key}>
                <div className="source-card-top">
                  <span className="source-icon">
                    <Icon
                      name={
                        key === "quests" ? "quests" : key === "training" ? "skills" : "exchange"
                      }
                    />
                  </span>
                  <StatusPill
                    state={
                      status?.state === "ready"
                        ? "success"
                        : status?.state === "failed"
                          ? "failed"
                          : "neutral"
                    }
                  >
                    {titleCase(status?.state ?? "checking")}
                  </StatusPill>
                </div>
                <h2>{detail.title}</h2>
                <p>{detail.description}</p>
                <dl>
                  <div>
                    <dt>Retained records</dt>
                    <dd>{formatNumber(count)}</dd>
                  </div>
                  <div>
                    <dt>Last success</dt>
                    <dd>{formatDate(status?.lastSuccessfulSyncAt)}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{status?.provider ?? "Not yet synchronized"}</dd>
                  </div>
                </dl>
                {status?.lastErrorMessage === undefined ? null : (
                  <InlineAlert tone="warning">{status.lastErrorMessage}</InlineAlert>
                )}
                <button
                  className="secondary-button wide"
                  type="button"
                  disabled={busy !== undefined || offlineMode}
                  onClick={() => void refresh(key)}
                >
                  <Icon name="refresh" className={busy === key ? "spin" : ""} />
                  {busy === key ? "Refreshing…" : `Refresh ${detail.title}`}
                </button>
              </article>
            );
          })}
        </section>
      )}
      <InlineAlert tone="info">
        A failed refresh never replaces the previous valid catalogue. Provider errors and stale
        timestamps remain visible.
      </InlineAlert>
    </div>
  );
}

export function UpdatesView() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Application lifecycle"
        title="Update status"
        description="Release information is shown locally; automatic installers are never applied silently."
      />
      <section className="surface-card update-panel">
        <span className="update-mark">
          <Icon name="check" size={30} />
        </span>
        <div>
          <p className="eyebrow">Installed release</p>
          <h2>Version 0.7.0</h2>
          <p>The bounded Ollama and LM Studio local-AI release.</p>
        </div>
        <StatusPill state="success">Current source build</StatusPill>
      </section>
      <section className="surface-card release-notes">
        <p className="eyebrow">What is included</p>
        <h2>Local AI milestone</h2>
        <ul className="feature-list">
          <li>
            <Icon name="check" />
            Model discovery, connection testing and provider selection
          </li>
          <li>
            <Icon name="check" />
            Multi-turn trusted tool use with bounded loops and timeouts
          </li>
          <li>
            <Icon name="check" />
            Bundled deterministic MCP runtime and offline cached mode
          </li>
          <li>
            <Icon name="check" />
            Windows packaging with macOS and Linux source targets
          </li>
        </ul>
      </section>
      <InlineAlert tone="info">
        Signed update feeds arrive with the stable release pipeline. This source build does not
        download or execute updates by itself.
      </InlineAlert>
    </div>
  );
}

export function SettingsView({
  runtime,
  theme,
  compactMode,
  offlineMode,
  onTheme,
  onCompact,
  onOffline,
}: {
  runtime?: RuntimeStatus;
  theme: ThemePreference;
  compactMode: boolean;
  offlineMode: boolean;
  onTheme: (theme: ThemePreference) => void;
  onCompact: (value: boolean) => void;
  onOffline: (value: boolean) => void;
}) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Local preferences"
        title="Settings"
        description="Appearance, density, privacy and offline behavior for this installation."
      />
      <div className="settings-grid">
        <section className="surface-card settings-section">
          <p className="eyebrow">Appearance</p>
          <h2>Theme</h2>
          <div className="choice-cards">
            {(["dark", "light", "system"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === value}
                  onChange={() => onTheme(value)}
                />
                <span>
                  <strong>{titleCase(value)}</strong>
                  <small>
                    {value === "system"
                      ? "Follow operating system"
                      : `${titleCase(value)} interface`}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <label className="toggle-row">
            <span>
              <strong>Compact density</strong>
              <small>Fit more planning information on screen.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={compactMode}
              onChange={(event) => onCompact(event.currentTarget.checked)}
            />
          </label>
        </section>
        <section className="surface-card settings-section">
          <p className="eyebrow">Privacy and network</p>
          <h2>Offline mode</h2>
          <label className="toggle-row">
            <span>
              <strong>Use retained local data only</strong>
              <small>Disable refresh buttons and keep all deterministic tools available.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={offlineMode}
              onChange={(event) => onOffline(event.currentTarget.checked)}
            />
          </label>
          <div className="runtime-card">
            <span className={`runtime-dot ${runtime?.ready === true ? "ready" : ""}`} />
            <div>
              <strong>Companion runtime</strong>
              <span>{runtime?.message ?? "Checking local runtime…"}</span>
            </div>
            <StatusPill state={runtime?.ready === true ? "success" : "failed"}>
              {runtime?.mode ?? "checking"}
            </StatusPill>
          </div>
          <InlineAlert tone="info">
            Profiles remain in the local Gielinor database. Passwords, tokens and game-client data
            are never accepted.
          </InlineAlert>
        </section>
      </div>
    </div>
  );
}

export function AboutView() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Open source"
        title="About Gielinor Companion"
        description="A model-independent, read-only RuneScape 3 planning companion."
      />
      <div className="about-grid">
        <section className="surface-card about-primary">
          <span className="brand-mark giant" aria-hidden="true">
            <i />
          </span>
          <div>
            <p className="eyebrow">Version 0.7.0</p>
            <h2>Built for informed play—not automated play.</h2>
            <p>
              Gielinor Companion brings public player progress, quest dependencies, training methods
              and guide-price analysis into one local application.
            </p>
          </div>
        </section>
        <section className="surface-card">
          <p className="eyebrow">Safety boundary</p>
          <h2>What it never does</h2>
          <ul className="feature-list">
            {[
              "No mouse or keyboard control",
              "No gameplay, combat or trade automation",
              "No client memory or network packet access",
              "No credentials, CAPTCHA handling or anti-cheat bypass",
            ].map((item) => (
              <li key={item}>
                <Icon name="close" />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="surface-card legal-card">
          <p className="eyebrow">Legal</p>
          <h2>Unofficial community project</h2>
          <p>
            Not affiliated with, endorsed by or connected to Jagex Ltd. RuneScape and related marks
            are trademarks of Jagex Ltd. No copyrighted RuneScape assets are bundled.
          </p>
          <p>Source code is available under the MIT License.</p>
        </section>
        <section className="surface-card">
          <p className="eyebrow">Data policy</p>
          <h2>Transparent sources</h2>
          <p>
            Jagex public APIs and revision-aware RuneScape Wiki data are validated, timestamped and
            cached. Source uncertainty and stale states remain visible.
          </p>
        </section>
      </div>
    </div>
  );
}
