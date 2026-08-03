import { useEffect, useState } from "react";
import { APPLICATION_VERSION, type DataOrigin } from "@gielinor/shared-types";

import {
  DataOriginBadge,
  InlineAlert,
  LoadingBlock,
  PageHeader,
  StatusPill,
} from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { desktopError } from "../lib/errors.js";
import { formatDate, formatNumber, titleCase } from "../lib/format.js";
import type { ThemePreference } from "../state/app-state.js";
import type {
  CompanionBridge,
  DataStatus,
  DesktopRedactedDiagnostics,
  DesktopSoftwareUpdateCheck,
  DesktopSystemHealth,
  RuntimeStatus,
  ToolEnvelope,
} from "../types.js";

type SourceKey = "quests" | "training" | "prices";

type CapabilityTruthRow = {
  capability: string;
  provider: string;
  state: string;
  origin: DataOrigin;
  timestamp: string | undefined;
  detail: string;
  warning: string | undefined;
  circuitState: string;
  failedRequests: number | undefined;
  lastFailureAt: string | undefined;
  lastSuccessAt: string | undefined;
  nextRefreshAt: string | undefined;
  cacheAgeMs: number | undefined;
  retainedRecords: number | undefined;
};

function formatAge(ageMs: number | undefined): string {
  if (ageMs === undefined) return "Unavailable";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}

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

function healthPill(
  state:
    | DesktopSystemHealth["overall"]
    | DesktopSystemHealth["database"]["state"]
    | DesktopSystemHealth["catalogues"][number]["state"],
): Parameters<typeof StatusPill>[0]["state"] {
  if (state === "healthy" || state === "fresh") {
    return "success";
  }
  if (state === "degraded" || state === "stale" || state === "offline") {
    return "warning";
  }
  if (state === "critical" || state === "safe-mode" || state === "failed") {
    return "failed";
  }
  return "neutral";
}

export function DiagnosticsView({
  bridge,
  offlineMode,
  onOffline,
}: {
  bridge: CompanionBridge;
  offlineMode: boolean;
  onOffline: (offline: boolean) => void;
}) {
  const [health, setHealth] = useState<DesktopSystemHealth>();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<
    { tone: "success" | "error" | "warning"; message: string } | undefined
  >();

  async function load(clearNotice = true) {
    setBusy("load");
    if (clearNotice) {
      setNotice(undefined);
    }
    try {
      const response = await bridge.callTool<DesktopSystemHealth>("get_system_health", {});
      setHealth(response.data);
    } catch (error) {
      const failure = desktopError(error, "desktop-system-health", "GC-MCP-003");
      setNotice({
        tone: "error",
        message: `${failure.userMessage} (${failure.code}; trace ${failure.traceId})`,
      });
    } finally {
      setBusy(undefined);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runAction(
    action: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(action);
    setNotice(undefined);
    try {
      await operation();
      setNotice({ tone: "success", message: successMessage });
      await load(false);
    } catch (error) {
      const failure = desktopError(error, action, "GC-MCP-003");
      setNotice({
        tone: "error",
        message: `${failure.userMessage} (${failure.code}; trace ${failure.traceId})`,
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function exportDiagnostics() {
    setBusy("export");
    setNotice(undefined);
    try {
      const response = await bridge.callTool<DesktopRedactedDiagnostics>(
        "export_redacted_diagnostics",
        {},
      );
      const content = JSON.stringify(response.data, null, 2);
      if (typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `gielinor-diagnostics-${response.data.generatedAt.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice({
        tone: "success",
        message: "Redacted diagnostics were prepared without profiles, credentials, or paths.",
      });
    } catch (error) {
      const failure = desktopError(error, "export-diagnostics", "GC-MCP-003");
      setNotice({
        tone: "error",
        message: `${failure.userMessage} (${failure.code}; trace ${failure.traceId})`,
      });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System health"
        title="Diagnostics centre"
        description="Inspect local storage, providers, circuits, catalogue freshness, recovery work and scheduled maintenance."
        actions={
          <>
            <button
              className="secondary-button"
              type="button"
              disabled={busy !== undefined}
              onClick={() => void exportDiagnostics()}
            >
              <Icon name="download" />
              Export diagnostics
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy !== undefined}
              onClick={() => void load()}
            >
              <Icon name="refresh" className={busy === "load" ? "spin" : ""} />
              Recheck
            </button>
          </>
        }
      />
      {notice === undefined ? null : <InlineAlert tone={notice.tone}>{notice.message}</InlineAlert>}
      {health === undefined ? (
        <LoadingBlock label="Aggregating redacted system health" />
      ) : (
        <>
          <section className={`health-hero health-${health.overall}`}>
            <div>
              <p className="eyebrow">Overall status</p>
              <h2>{titleCase(health.overall)}</h2>
              <p>Checked {formatDate(health.checkedAt)}</p>
            </div>
            <StatusPill state={healthPill(health.overall)}>{titleCase(health.overall)}</StatusPill>
          </section>

          <section className="health-summary-grid">
            <article className="surface-card">
              <div className="health-card-title">
                <h2>Database</h2>
                <StatusPill state={healthPill(health.database.state)}>
                  {titleCase(health.database.state)}
                </StatusPill>
              </div>
              <p>{health.database.message}</p>
              <dl>
                <div>
                  <dt>Last successful check</dt>
                  <dd>{formatDate(health.database.lastSuccessAt)}</dd>
                </div>
                <div>
                  <dt>Active code</dt>
                  <dd>{health.database.errorCode ?? "None"}</dd>
                </div>
              </dl>
              <button
                className="secondary-button wide"
                type="button"
                disabled={busy !== undefined}
                onClick={() =>
                  void runAction(
                    "database-integrity",
                    () => bridge.callTool("run_database_integrity_check", {}),
                    "The read-only SQLite integrity check completed.",
                  )
                }
              >
                Run database integrity check
              </button>
            </article>

            <article className="surface-card">
              <div className="health-card-title">
                <h2>Scheduler</h2>
                <StatusPill state={healthPill(health.scheduler.state)}>
                  {titleCase(health.scheduler.state)}
                </StatusPill>
              </div>
              <dl>
                <div>
                  <dt>Running jobs</dt>
                  <dd>{health.scheduler.runningJobs}</dd>
                </div>
                <div>
                  <dt>Jobs in backoff</dt>
                  <dd>{health.scheduler.failedJobs}</dd>
                </div>
                <div>
                  <dt>Background refresh</dt>
                  <dd>{health.scheduler.enabled ? "Enabled" : "Disabled"}</dd>
                </div>
              </dl>
            </article>

            <article className="surface-card">
              <div className="health-card-title">
                <h2>Network mode</h2>
                <StatusPill state={offlineMode ? "warning" : "success"}>
                  {offlineMode ? "Offline" : "Online"}
                </StatusPill>
              </div>
              <label className="toggle-row">
                <span>
                  <strong>Use retained local data only</strong>
                  <small>Network refresh actions remain disabled while this is active.</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={offlineMode}
                  onChange={(event) => onOffline(event.currentTarget.checked)}
                />
              </label>
              <p>
                Safe mode: {health.overall === "safe-mode" ? "active (writes restricted)" : "off"}
              </p>
            </article>
          </section>

          <section className="surface-card">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Local datasets</p>
                <h2>Catalogue freshness</h2>
              </div>
            </div>
            <div className="diagnostic-list">
              {health.catalogues.map((catalogue) => (
                <article key={catalogue.catalogue}>
                  <div>
                    <strong>{titleCase(catalogue.catalogue)}</strong>
                    <small>
                      {formatNumber(catalogue.recordCount)} records · last success{" "}
                      {formatDate(catalogue.lastSuccessAt)}
                    </small>
                    <small>Next refresh {formatDate(catalogue.nextRefreshAt)}</small>
                    {catalogue.lastErrorCode === undefined ? null : (
                      <code>{catalogue.lastErrorCode}</code>
                    )}
                  </div>
                  <StatusPill state={healthPill(catalogue.state)}>
                    {titleCase(catalogue.state)}
                  </StatusPill>
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`Refresh ${SOURCE_DETAILS[catalogue.catalogue].title.toLowerCase()}`}
                    disabled={busy !== undefined || offlineMode}
                    onClick={() =>
                      void runAction(
                        `refresh-${catalogue.catalogue}`,
                        () =>
                          bridge.callTool(
                            SOURCE_DETAILS[
                              catalogue.catalogue === "prices" ? "prices" : catalogue.catalogue
                            ].refreshTool,
                            {},
                          ),
                        `${titleCase(catalogue.catalogue)} refresh completed.`,
                      )
                    }
                  >
                    Refresh
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-card">
            <p className="eyebrow">Public sources</p>
            <h2>Providers and circuit breakers</h2>
            <div className="diagnostic-list compact">
              {health.providers.map((provider) => (
                <article key={`${provider.providerId}:${provider.capability}`}>
                  <div>
                    <strong>{titleCase(provider.capability)}</strong>
                    <small>{provider.providerId}</small>
                    <small>
                      {provider.successfulRequests} successful · {provider.failedRequests} failed
                    </small>
                  </div>
                  <StatusPill
                    state={
                      provider.circuitState === "open"
                        ? "failed"
                        : provider.state === "degraded"
                          ? "warning"
                          : provider.state === "healthy"
                            ? "success"
                            : "neutral"
                    }
                  >
                    {titleCase(provider.circuitState)}
                  </StatusPill>
                  {provider.circuitState === "closed" ? null : (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy !== undefined || offlineMode}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Reset only the ${provider.providerId} ${provider.capability} circuit? This permits the normal bounded provider probe.`,
                          )
                        ) {
                          void runAction(
                            `reset-${provider.providerId}-${provider.capability}`,
                            () =>
                              bridge.callTool("reset_provider_circuit", {
                                providerId: provider.providerId,
                                capability: provider.capability,
                                confirmed: true,
                              }),
                            "The selected provider circuit was reset after confirmation.",
                          );
                        }
                      }}
                    >
                      Reset circuit
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="diagnostics-events-grid">
            <article className="surface-card">
              <p className="eyebrow">Actionable failures</p>
              <h2>Active errors</h2>
              {health.activeErrors.length === 0 ? (
                <p>No active structured errors.</p>
              ) : (
                <ul className="diagnostic-events">
                  {health.activeErrors.map((error) => (
                    <li key={error.traceId}>
                      <code>{error.code}</code>
                      <span>{error.userMessage}</span>
                      <small>Trace {error.traceId}</small>
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="surface-card">
              <p className="eyebrow">Self-healing history</p>
              <h2>Recent recoveries</h2>
              {health.recentRecoveries.length === 0 ? (
                <p>No recovery actions have been required.</p>
              ) : (
                <ul className="diagnostic-events">
                  {health.recentRecoveries.map((recovery) => (
                    <li key={recovery.eventId}>
                      <strong>{recovery.action}</strong>
                      <span>{titleCase(recovery.outcome)}</span>
                      <small>{formatDate(recovery.occurredAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="surface-card diagnostics-footer-actions">
            <div>
              <p className="eyebrow">Application lifecycle</p>
              <h2>Update checker</h2>
              <p>{health.updateChecker.message}</p>
            </div>
            <StatusPill state={healthPill(health.updateChecker.state)}>
              {titleCase(health.updateChecker.state)}
            </StatusPill>
            <button
              className="secondary-button"
              type="button"
              disabled={busy !== undefined || offlineMode}
              onClick={() =>
                void runAction(
                  "check-updates",
                  () =>
                    bridge.callTool("check_for_software_updates", {
                      includePrereleases: false,
                      forceRefresh: true,
                    }),
                  "The read-only software update check completed.",
                )
              }
            >
              Check for updates
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy !== undefined}
              onClick={() => {
                if (
                  window.confirm(
                    "Delete only cache quarantine records older than 30 days? Active cache and player data are not affected.",
                  )
                ) {
                  void runAction(
                    "clear-expired-quarantine",
                    () =>
                      bridge.callTool("clear_expired_quarantine_records", {
                        retentionDays: 30,
                      }),
                    "Expired quarantine records were cleared; active data was preserved.",
                  );
                }
              }}
            >
              Clear expired quarantine
            </button>
            <a
              className="secondary-button"
              href="https://github.com/DionCroft/Gielinor-Companion-MCP/blob/main/docs/errors/troubleshooting.md"
              target="_blank"
              rel="noreferrer"
            >
              Open troubleshooting
            </a>
          </section>
        </>
      )}
    </div>
  );
}

export function DataStatusView({
  bridge,
  offlineMode,
}: {
  bridge: CompanionBridge;
  offlineMode: boolean;
}) {
  const [statuses, setStatuses] = useState<Partial<Record<SourceKey, ToolEnvelope<DataStatus>>>>(
    {},
  );
  const [system, setSystem] = useState<ToolEnvelope<DesktopSystemHealth>>();
  const [selected, setSelected] = useState<
    ToolEnvelope<{
      profile?: { lastHiscoresRefresh?: string; skills?: unknown[] };
      holdings?: { capturedAt?: string; source?: string } | null;
      selectedAt?: string;
    }>
  >();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function load() {
    setError(undefined);
    try {
      const entries = await Promise.all(
        (
          Object.entries(SOURCE_DETAILS) as Array<[SourceKey, (typeof SOURCE_DETAILS)[SourceKey]]>
        ).map(
          async ([key, detail]) =>
            [key, await bridge.callTool<DataStatus>(detail.statusTool, {})] as const,
        ),
      );
      setStatuses(Object.fromEntries(entries));
      const [systemResult, selectedResult] = await Promise.allSettled([
        bridge.callTool<DesktopSystemHealth>("get_system_health", {}),
        bridge.callTool<{
          profile?: { lastHiscoresRefresh?: string; skills?: unknown[] };
          holdings?: { capturedAt?: string; source?: string } | null;
          selectedAt?: string;
        }>("get_selected_player_snapshot", {}),
      ]);
      if (systemResult.status === "fulfilled") setSystem(systemResult.value);
      if (selectedResult.status === "fulfilled") setSelected(selectedResult.value);
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

  async function verifyLiveData() {
    if (offlineMode) {
      setError("Offline mode is enabled. Live verification cannot call public providers.");
      return;
    }
    setBusy("verify");
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await bridge.callTool<{
        limited: boolean;
        stages: Array<{ stage: string; status: string }>;
      }>("refresh_all_real_data", {});
      const failed = response.data.stages.filter(({ status }) => status !== "complete");
      setNotice(
        response.data.limited
          ? `Verification completed in limited mode. ${failed.map(({ stage }) => stage).join(", ")} did not refresh; retained valid data remains available.`
          : "Live providers were verified and all public snapshots refreshed successfully.",
      );
      await load();
    } catch (caught) {
      const failure = desktopError(caught, "verify-live-data", "GC-SYNC-001");
      setError(`${failure.userMessage} (${failure.code}; trace ${failure.traceId})`);
    } finally {
      setBusy(undefined);
    }
  }

  function originForPrivateSource(source: string | undefined): DataOrigin {
    if (source === "alt1-confirmed") return "alt1-confirmed";
    if (source === "csv-import" || source === "json-import") return "imported-local";
    return selected === undefined ? "unavailable" : "manual-local";
  }

  function capabilityRows(): CapabilityTruthRow[] {
    const quest = statuses.quests;
    const training = statuses.training;
    const prices = statuses.prices;
    const providers = system?.data.providers ?? [];
    const provider = (capability: string) =>
      providers.find((candidate) => candidate.capability === capability);
    const catalogue = (catalogueName: SourceKey) =>
      system?.data.catalogues.find((candidate) => candidate.catalogue === catalogueName);
    const operational = (capability?: string, catalogueName?: SourceKey) => {
      const providerHealth = capability === undefined ? undefined : provider(capability);
      const catalogueHealth = catalogueName === undefined ? undefined : catalogue(catalogueName);
      return {
        circuitState: providerHealth?.circuitState ?? "not-applicable",
        failedRequests: providerHealth?.failedRequests,
        lastFailureAt: providerHealth?.lastFailureAt ?? catalogueHealth?.lastFailureAt,
        lastSuccessAt: providerHealth?.lastSuccessAt ?? catalogueHealth?.lastSuccessAt,
        nextRefreshAt: providerHealth?.nextProbeAt ?? catalogueHealth?.nextRefreshAt,
        cacheAgeMs: catalogueHealth?.ageMs,
        retainedRecords: catalogueHealth?.recordCount,
      };
    };
    const healthState = (capability: string) => provider(capability)?.state ?? "unknown";
    const statusOrigin = (response: ToolEnvelope<DataStatus> | undefined): DataOrigin =>
      response?.meta.provenance?.origin ??
      (response?.data.state === "ready" ? "validated-cache" : "unavailable");
    const localProfile = selected?.data.profile;
    const holdings = selected?.data.holdings;
    const privateOrigin = originForPrivateSource(holdings?.source);
    const update = system?.data.updateChecker;
    return [
      {
        capability: "Public Hiscores",
        provider: provider("player-stats")?.providerId ?? "Jagex Hiscores",
        state: localProfile?.lastHiscoresRefresh === undefined ? "unavailable" : "ready",
        origin:
          localProfile?.lastHiscoresRefresh === undefined
            ? ("unavailable" as const)
            : ("validated-cache" as const),
        timestamp: localProfile?.lastHiscoresRefresh,
        detail:
          localProfile?.lastHiscoresRefresh === undefined
            ? "No public Hiscores snapshot is retained for the selected profile."
            : `${localProfile.skills?.length ?? 0} public skill records retained locally.`,
        warning:
          healthState("player-stats") === "degraded"
            ? "The Hiscores provider is degraded; retained data may be used."
            : undefined,
        ...operational("player-stats"),
      },
      {
        capability: "Quest catalogue",
        provider: quest?.data.provider ?? "RuneScape Wiki",
        state: quest?.data.state ?? "unavailable",
        origin: statusOrigin(quest),
        timestamp: quest?.data.lastSuccessfulSyncAt,
        detail: `${formatNumber(quest?.data.questCount ?? 0)} revision-aware quest records.`,
        warning: quest?.data.lastErrorMessage,
        ...operational(undefined, "quests"),
      },
      {
        capability: "Training catalogue",
        provider: training?.data.provider ?? "RuneScape Wiki",
        state: training?.data.state ?? "unavailable",
        origin: statusOrigin(training),
        timestamp: training?.data.lastSuccessfulSyncAt,
        detail: `${formatNumber(training?.data.methodCount ?? 0)} source-backed training methods.`,
        warning: training?.data.lastErrorMessage,
        ...operational(undefined, "training"),
      },
      {
        capability: "GE catalogue",
        provider: prices?.data.provider ?? "Weird Gloop RS3 catalogue",
        state: prices?.data.state ?? "unavailable",
        origin: statusOrigin(prices),
        timestamp: prices?.data.lastSuccessfulSyncAt,
        detail: `${formatNumber(prices?.data.itemCount ?? 0)} RS3 guide-price catalogue records.`,
        warning: prices?.data.lastErrorMessage,
        ...operational(undefined, "prices"),
      },
      {
        capability: "Current guide prices",
        provider: provider("current-price")?.providerId ?? "Jagex ItemDB",
        state: prices?.data.state === "ready" ? healthState("current-price") : "unavailable",
        origin: statusOrigin(prices),
        timestamp: prices?.data.lastSuccessfulSyncAt,
        detail: "On-demand RS3 guide values; this is not a live order book.",
        warning: undefined,
        ...operational("current-price", "prices"),
      },
      {
        capability: "Price history",
        provider: provider("price-history")?.providerId ?? "Jagex graph and Weird Gloop history",
        state: (prices?.data.historyPointCount ?? 0) > 0 ? "ready" : "available-on-demand",
        origin: statusOrigin(prices),
        timestamp: prices?.data.lastSuccessfulSyncAt,
        detail:
          (prices?.data.historyPointCount ?? 0) > 0
            ? `${formatNumber(prices?.data.historyPointCount ?? 0)} validated daily history points retained.`
            : "History is requested per item; no history has been retained yet.",
        warning: undefined,
        ...operational("price-history", "prices"),
      },
      {
        capability: "RuneScape news context",
        provider: "RuneScape news via Weird Gloop",
        state: "available-on-demand",
        origin: "unavailable" as const,
        timestamp: undefined,
        detail: "Fetched only during market analysis; no standalone health snapshot is fabricated.",
        warning:
          "A missing news response lowers context coverage and never creates a causal claim.",
        ...operational(),
      },
      {
        capability: "Software updates",
        provider: "GitHub Releases",
        state: update?.state ?? "unavailable",
        origin:
          update?.lastSuccessAt === undefined
            ? ("unavailable" as const)
            : ("validated-cache" as const),
        timestamp: update?.lastSuccessAt,
        detail: update?.message ?? "Validated release metadata has not been checked.",
        warning: update?.errorCode,
        ...operational(),
      },
      {
        capability: "Local private records",
        provider: "Local SQLite",
        state: selected === undefined ? "unavailable" : "ready",
        origin: privateOrigin,
        timestamp: holdings?.capturedAt ?? selected?.data.selectedAt,
        detail:
          selected === undefined
            ? "No selected local profile was available."
            : holdings === null
              ? "Selected profile is local; no holdings snapshot has been entered."
              : "Selected profile and user-controlled holdings are stored locally.",
        warning: undefined,
        ...operational(),
      },
      {
        capability: "Optional Alt1 capture",
        provider: "Read-only Alt1 overlay",
        state: holdings?.source === "alt1-confirmed" ? "confirmed" : "not-connected",
        origin:
          holdings?.source === "alt1-confirmed"
            ? ("alt1-confirmed" as const)
            : ("unavailable" as const),
        timestamp: holdings?.source === "alt1-confirmed" ? holdings.capturedAt : undefined,
        detail:
          holdings?.source === "alt1-confirmed"
            ? "The latest visible-screen capture was confirmed by the user before saving."
            : "Optional visible-screen suggestions require explicit user confirmation before saving.",
        warning:
          "Alt1 does not provide a complete account, bank, inventory, or active-offer snapshot.",
        ...operational(),
      },
    ];
  }

  function exportProvenance() {
    const report = {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      applicationVersion: APPLICATION_VERSION,
      offlineMode,
      capabilities: capabilityRows().map(
        ({ capability, provider, state, origin, timestamp, detail, warning }) => ({
          capability,
          provider,
          state,
          origin,
          ...(timestamp === undefined ? {} : { timestamp }),
          detail,
          ...(warning === undefined ? {} : { warning }),
        }),
      ),
      redactionNotice:
        "This report excludes display names, profile identifiers, holdings, trades, credentials, payloads, and local paths.",
    };
    if (typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `gielinor-provenance-${report.generatedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setNotice("A redacted provenance report was prepared without player-private records.");
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Provider health"
        title="Data sources"
        description="See exactly what is local, when it was refreshed, and whether retained data is stale."
        actions={
          <>
            <button className="secondary-button" type="button" onClick={exportProvenance}>
              <Icon name="download" />
              Export provenance
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy !== undefined || offlineMode}
              onClick={() => void verifyLiveData()}
            >
              <Icon name="refresh" className={busy === "verify" ? "spin" : ""} />
              {busy === "verify" ? "Verifying…" : "Verify live data now"}
            </button>
          </>
        }
      />
      {offlineMode ? (
        <InlineAlert tone="info">
          Offline mode is active. Read-only views use the last validated local snapshots.
        </InlineAlert>
      ) : null}
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      {notice === undefined ? null : <InlineAlert tone="success">{notice}</InlineAlert>}
      {Object.keys(statuses).length === 0 && error === undefined ? (
        <LoadingBlock label="Checking local data sources" />
      ) : (
        <section className="source-card-grid">
          {(
            Object.entries(SOURCE_DETAILS) as Array<[SourceKey, (typeof SOURCE_DETAILS)[SourceKey]]>
          ).map(([key, detail]) => {
            const response = statuses[key];
            const status = response?.data;
            const provenance = response?.meta.provenance;
            const count = status?.questCount ?? status?.methodCount ?? status?.itemCount ?? 0;
            const parseWarningCount = Object.values(
              status?.coverage?.parseWarningsByField ?? {},
            ).reduce((total, value) => total + value, 0);
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
                {provenance === undefined ? null : (
                  <DataOriginBadge
                    origin={provenance.origin}
                    provider={provenance.provider}
                    timestamp={provenance.timestamp}
                  />
                )}
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
                  <div>
                    <dt>Data class</dt>
                    <dd>{provenance?.origin ?? "unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Last attempted</dt>
                    <dd>{formatDate(status?.lastAttemptAt)}</dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>{status?.sourceRevision ?? "Unavailable"}</dd>
                  </div>
                </dl>
                {status?.coverage === undefined ? null : (
                  <p>
                    Quest coverage: {formatNumber(status.coverage.questsWithPrerequisiteData)} with
                    prerequisites; {formatNumber(status.coverage.questsWithSkillRequirements)} with
                    skill requirements; {formatNumber(status.coverage.questsWithItemRequirements)}
                    with item requirements;{" "}
                    {formatNumber(status.coverage.questsWithStructuredRewards)}
                    with structured rewards. {formatNumber(parseWarningCount)} explicit parse
                    warnings retained.
                  </p>
                )}
                {status?.lastErrorMessage === undefined ? null : (
                  <InlineAlert tone="warning">
                    {status.lastErrorCode === undefined ? "" : `${status.lastErrorCode}: `}
                    {status.lastErrorMessage}
                  </InlineAlert>
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
      <section className="surface-card">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Source-truth contract</p>
            <h2>All user-facing data capabilities</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={busy !== undefined}
            onClick={() => void load()}
          >
            Recheck local status
          </button>
        </div>
        <div className="diagnostic-list capability-truth-list">
          {capabilityRows().map((capability) => (
            <article key={capability.capability}>
              <div>
                <strong>{capability.capability}</strong>
                <small>{capability.provider}</small>
                <small>{capability.detail}</small>
                <small>
                  Last success {formatDate(capability.lastSuccessAt ?? capability.timestamp)} · Last
                  failure {formatDate(capability.lastFailureAt)} · Next refresh/probe{" "}
                  {formatDate(capability.nextRefreshAt)}
                </small>
                <small>
                  Circuit {titleCase(capability.circuitState)} · Failed requests{" "}
                  {formatNumber(capability.failedRequests)} · Cache age{" "}
                  {formatAge(capability.cacheAgeMs)} · Retained records{" "}
                  {formatNumber(capability.retainedRecords)}
                </small>
                {capability.warning === undefined ? null : <small>{capability.warning}</small>}
              </div>
              <DataOriginBadge
                origin={capability.origin}
                provider={capability.provider}
                {...(capability.timestamp === undefined ? {} : { timestamp: capability.timestamp })}
              />
              <StatusPill
                state={
                  ["ready", "healthy", "confirmed"].includes(capability.state)
                    ? "success"
                    : ["failed", "unavailable"].includes(capability.state)
                      ? "failed"
                      : "warning"
                }
              >
                {titleCase(capability.state)}
              </StatusPill>
            </article>
          ))}
        </div>
      </section>
      <InlineAlert tone="info">
        A failed refresh never replaces the previous valid catalogue. Provider errors and stale
        timestamps remain visible.
      </InlineAlert>
    </div>
  );
}

function updatePill(
  state: DesktopSoftwareUpdateCheck["state"],
): Parameters<typeof StatusPill>[0]["state"] {
  if (state === "up-to-date") {
    return "success";
  }
  if (state === "update-available" || state === "pre-release-available" || state === "offline") {
    return "warning";
  }
  if (state === "unable-to-check" || state === "invalid-release-metadata") {
    return "failed";
  }
  return "neutral";
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${bytes} B`;
  }
  if (bytes < 1_048_576) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function UpdatesView({ bridge }: { bridge: CompanionBridge }) {
  const [status, setStatus] = useState<DesktopSoftwareUpdateCheck>();
  const [includePrereleases, setIncludePrereleases] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function check(forceRefresh: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<DesktopSoftwareUpdateCheck>(
        "check_for_software_updates",
        {
          includePrereleases,
          forceRefresh,
        },
      );
      setStatus(response.data);
    } catch (caught) {
      const failure = desktopError(caught, "check-software-updates", "GC-UPDATE-001");
      setError(`${failure.userMessage} (${failure.code}; trace ${failure.traceId})`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void check(false);
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Application lifecycle"
        title="Update status"
        description="Validated GitHub Releases metadata is cached locally; updates always remain an explicit user action."
        actions={
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void check(true)}
          >
            <Icon name="refresh" className={busy ? "spin" : ""} />
            {busy ? "Checking…" : "Check now"}
          </button>
        }
      />
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      {status === undefined ? (
        <LoadingBlock label="Checking validated GitHub release metadata" />
      ) : (
        <>
          <section className="surface-card update-panel">
            <span className="update-mark">
              <Icon
                name={
                  status.state === "up-to-date"
                    ? "check"
                    : status.state === "update-available" ||
                        status.state === "pre-release-available"
                      ? "updates"
                      : "warning"
                }
                size={30}
              />
            </span>
            <div>
              <p className="eyebrow">Installed release</p>
              <h2>Version {status.installedVersion}</h2>
              <p>{status.message}</p>
              <small>
                Checked {formatDate(status.checkedAt)} · source {titleCase(status.source)}
              </small>
            </div>
            <StatusPill state={updatePill(status.state)}>{titleCase(status.state)}</StatusPill>
          </section>

          <section className="surface-card settings-section update-preferences">
            <p className="eyebrow">Release channel</p>
            <h2>Update preferences</h2>
            <label className="toggle-row">
              <span>
                <strong>Include pre-releases</strong>
                <small>Stable releases remain the default and recommended channel.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={includePrereleases}
                onChange={(event) => setIncludePrereleases(event.currentTarget.checked)}
              />
            </label>
            {status.errorCode === undefined ? null : (
              <InlineAlert tone="warning">
                {status.errorCode} · cached metadata may still be shown.
              </InlineAlert>
            )}
          </section>

          {status.release === undefined ? null : (
            <section className="surface-card release-notes">
              <p className="eyebrow">
                {status.release.prerelease ? "Pre-release" : "Latest stable release"}
              </p>
              <div className="section-heading-row">
                <div>
                  <h2>{status.release.name}</h2>
                  <p>Published {formatDate(status.release.publishedAt)}</p>
                </div>
                <a
                  className="secondary-button"
                  href={status.release.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open official release
                </a>
              </div>
              <p className="release-notes-copy">
                {status.release.notes || "No release notes were published."}
              </p>
              {status.recommendedAsset === undefined ? (
                <InlineAlert tone="warning">
                  No recommended asset matches this operating system and architecture. Open the
                  official release page to review supported downloads.
                </InlineAlert>
              ) : (
                <div className="recommended-release-asset">
                  <div>
                    <p className="eyebrow">Recommended for this computer</p>
                    <strong>{status.recommendedAsset.name}</strong>
                    <small>
                      {status.checksumMetadataAvailable
                        ? "Published SHA-256 metadata is available."
                        : "Checksum metadata is missing; do not install until the release is corrected."}
                    </small>
                  </div>
                  <a
                    className="primary-button"
                    href={status.recommendedAsset.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View recommended download
                  </a>
                </div>
              )}
              <h3>Platform assets</h3>
              {status.release.assets.length === 0 ? (
                <p>No platform-specific assets are attached to this release.</p>
              ) : (
                <ul className="release-assets">
                  {status.release.assets.map((asset) => (
                    <li key={asset.downloadUrl}>
                      <div>
                        <strong>{asset.name}</strong>
                        <small>
                          {asset.contentType} · {formatBytes(asset.size)}
                        </small>
                        <code>{asset.digest ?? "Checksum not published"}</code>
                      </div>
                      <a
                        className="secondary-button"
                        href={asset.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View asset
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      <InlineAlert tone="info">
        The checker is read-only. It never downloads, installs, or executes release assets. Verify
        the published checksum before installing an update yourself.
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
            <p className="eyebrow">Version {APPLICATION_VERSION}</p>
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
