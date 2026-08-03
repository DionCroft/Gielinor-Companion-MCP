import { useRef, useState, type FormEvent } from "react";

import type {
  CompanionBridge,
  DataStatus,
  DesktopProfile,
  RuntimeStatus,
  ToolEnvelope,
} from "../types.js";
import { InlineAlert, RuntimeDataBanner } from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { desktopError } from "../lib/errors.js";
import { CreateProfileFormSchema, firstError } from "../lib/validation.js";

type SetupStageId =
  | "runtime"
  | "database"
  | "profile"
  | "hiscores"
  | "quests"
  | "training"
  | "grand-exchange"
  | "history"
  | "market-engine"
  | "provenance"
  | "ready";

type SetupStage = {
  id: SetupStageId;
  label: string;
  status: "pending" | "active" | "complete" | "failed";
  detail?: string;
};

const INITIAL_STAGES: readonly SetupStage[] = [
  { id: "runtime", label: "Runtime ready", status: "pending" },
  { id: "database", label: "Database ready", status: "pending" },
  { id: "profile", label: "Player profile created", status: "pending" },
  { id: "hiscores", label: "Public Hiscores refreshed", status: "pending" },
  { id: "quests", label: "Quest catalogue synchronised", status: "pending" },
  { id: "training", label: "Training catalogue synchronised", status: "pending" },
  { id: "grand-exchange", label: "GE catalogue synchronised", status: "pending" },
  { id: "history", label: "Historical providers checked", status: "pending" },
  { id: "market-engine", label: "Market engine ready", status: "pending" },
  { id: "provenance", label: "Data provenance verified", status: "pending" },
  { id: "ready", label: "Companion ready", status: "pending" },
];

const CATALOGUES = [
  {
    id: "quests",
    label: "quest",
    statusTool: "get_quest_data_status",
    refreshTool: "refresh_quest_data",
    count: (status: DataStatus) => status.questCount ?? 0,
  },
  {
    id: "training",
    label: "training",
    statusTool: "get_training_data_status",
    refreshTool: "refresh_training_data",
    count: (status: DataStatus) => status.methodCount ?? 0,
  },
  {
    id: "grand-exchange",
    label: "Grand Exchange",
    statusTool: "get_price_data_status",
    refreshTool: "refresh_price_data",
    count: (status: DataStatus) => status.itemCount ?? 0,
  },
] as const;

type MarketDataStatus = DataStatus & {
  historyItemCount?: number;
  historyPointCount?: number;
  offline?: boolean;
};

type DatabaseHealth = {
  state: string;
  message?: string;
};

export function FirstRunView({
  bridge,
  runtime,
  onComplete,
}: {
  bridge: CompanionBridge;
  runtime?: RuntimeStatus;
  onComplete: (profile: DesktopProfile) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [gameMode, setGameMode] = useState<"normal" | "ironman" | "hardcore-ironman">("normal");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [limitedReady, setLimitedReady] = useState(false);
  const [profile, setProfile] = useState<DesktopProfile>();
  const [stages, setStages] = useState<SetupStage[]>(() =>
    INITIAL_STAGES.map((stage) => ({ ...stage })),
  );
  const continued = useRef(false);
  const observedEnvelopes = useRef<ToolEnvelope<unknown>[]>([]);
  const activeStage = useRef<SetupStageId>("runtime");

  function updateStage(id: SetupStageId, status: SetupStage["status"], detail?: string): void {
    if (status === "active") activeStage.current = id;
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, status, ...(detail === undefined ? {} : { detail }) } : stage,
      ),
    );
  }

  function observe<T>(response: ToolEnvelope<T>): ToolEnvelope<T> {
    observedEnvelopes.current.push(response as ToolEnvelope<unknown>);
    return response;
  }

  function continueWith(profileToUse: DesktopProfile): void {
    if (!continued.current) {
      continued.current = true;
      onComplete(profileToUse);
    }
  }

  async function populateCatalogue(catalogue: (typeof CATALOGUES)[number]): Promise<boolean> {
    updateStage(catalogue.id, "active");
    try {
      const status = observe(await bridge.callTool<DataStatus>(catalogue.statusTool, {}));
      if (status.data.state === "ready" && catalogue.count(status.data) > 0) {
        updateStage(
          catalogue.id,
          "complete",
          `${catalogue.count(status.data).toLocaleString()} retained validated records from ${status.data.provider ?? "local SQLite"}`,
        );
        return true;
      }
      const refreshed = observe(await bridge.callTool(catalogue.refreshTool, {}));
      updateStage(
        catalogue.id,
        "complete",
        `Synchronised from ${refreshed.meta.provenance?.provider ?? refreshed.meta.source}`,
      );
      return true;
    } catch (caught) {
      const failure = desktopError(caught, `first-run-${catalogue.id}`, "GC-SYNC-001");
      updateStage(
        catalogue.id,
        "failed",
        `${failure.code}; trace ${failure.traceId}. Existing validated data was preserved.`,
      );
      return false;
    }
  }

  async function checkHistoryProviders(): Promise<boolean> {
    updateStage("history", "active");
    try {
      const response = observe(
        await bridge.callTool<MarketDataStatus>("get_market_data_status", {}),
      );
      const points = response.data.historyPointCount ?? 0;
      const items = response.data.historyItemCount ?? 0;
      updateStage(
        "history",
        "complete",
        points > 0
          ? `${points.toLocaleString()} validated history points retained for ${items.toLocaleString()} items`
          : "History adapters are available; item history is loaded only when requested",
      );
      return true;
    } catch (caught) {
      const failure = desktopError(caught, "first-run-history", "GC-PROVIDER-001");
      updateStage("history", "failed", `${failure.code}; trace ${failure.traceId}`);
      return false;
    }
  }

  async function checkMarketEngine(profileId: string): Promise<boolean> {
    updateStage("market-engine", "active");
    try {
      const response = observe(
        await bridge.callTool("get_market_preferences", {
          profileId,
        }),
      );
      updateStage(
        "market-engine",
        "complete",
        `Deterministic market configuration loaded from ${response.meta.provenance?.provider ?? response.meta.source}`,
      );
      return true;
    } catch (caught) {
      const failure = desktopError(caught, "first-run-market-engine", "GC-DATA-002");
      updateStage("market-engine", "failed", `${failure.code}; trace ${failure.traceId}`);
      return false;
    }
  }

  async function verifyProvenance(): Promise<boolean> {
    updateStage("provenance", "active");
    const responses = observedEnvelopes.current;
    const missing = responses.filter(({ meta }) => meta.provenance === undefined).length;
    if (responses.length === 0 || missing > 0) {
      updateStage(
        "provenance",
        "failed",
        `${missing || 1} runtime response${missing === 1 ? "" : "s"} did not include a source-truth classification`,
      );
      return false;
    }
    const origins = [...new Set(responses.map(({ meta }) => meta.provenance?.origin))];
    updateStage(
      "provenance",
      "complete",
      `${responses.length} responses verified: ${origins.join(", ")}`,
    );
    return true;
  }

  async function retryStage(stageId: SetupStageId): Promise<void> {
    if (profile === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      if (stageId === "hiscores") {
        updateStage("hiscores", "active");
        const refreshed = observe(
          await bridge.callTool<DesktopProfile>("refresh_player_stats", {
            profileId: profile.id,
          }),
        );
        setProfile(refreshed.data);
        updateStage("hiscores", "complete", "Live public Jagex Hiscores snapshot retained locally");
        return;
      }
      const catalogue = CATALOGUES.find(({ id }) => id === stageId);
      if (catalogue !== undefined) {
        await populateCatalogue(catalogue);
        return;
      }
      if (stageId === "history") {
        await checkHistoryProviders();
        return;
      }
      if (stageId === "market-engine") {
        await checkMarketEngine(profile.id);
        return;
      }
      if (stageId === "provenance") {
        await verifyProvenance();
      }
    } catch (caught) {
      const failure = desktopError(caught, `first-run-retry-${stageId}`, "GC-SYNC-001");
      updateStage(stageId, "failed", `${failure.code}; trace ${failure.traceId}`);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CreateProfileFormSchema.safeParse({ displayName, gameMode });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setLimitedReady(false);
    setProfile(undefined);
    observedEnvelopes.current = [];
    continued.current = false;
    setStages(INITIAL_STAGES.map((stage) => ({ ...stage })));
    setError(undefined);
    try {
      updateStage("runtime", "active");
      if (runtime?.ready !== true) {
        throw new Error(runtime?.message ?? "The native runtime is not ready");
      }
      updateStage(
        "runtime",
        "complete",
        `${runtime.mode}${runtime.transport === undefined ? "" : ` using ${runtime.transport} transport`}`,
      );

      updateStage("database", "active");
      const database = observe(
        await bridge.callTool<DatabaseHealth>("run_database_integrity_check", {}),
      );
      if (["critical", "safe-mode", "unknown"].includes(database.data.state)) {
        throw new Error(database.data.message ?? `Database state is ${database.data.state}`);
      }
      updateStage("database", "complete", database.data.message ?? "SQLite integrity validated");

      updateStage("profile", "active");
      const created = observe(
        await bridge.callTool<DesktopProfile>("create_player_profile", parsed.data),
      );
      let activeProfile = created.data;
      setProfile(activeProfile);
      observe(
        await bridge.callTool("set_selected_player_profile", {
          profileId: activeProfile.id,
        }),
      );
      updateStage("profile", "complete", "Selected private local profile persisted");

      let optionalFailures = 0;
      updateStage("hiscores", "active");
      try {
        const refreshed = observe(
          await bridge.callTool<DesktopProfile>("refresh_player_stats", {
            profileId: activeProfile.id,
          }),
        );
        activeProfile = refreshed.data;
        setProfile(activeProfile);
        updateStage("hiscores", "complete", "Live public Jagex Hiscores snapshot retained locally");
      } catch (caught) {
        optionalFailures += 1;
        const failure = desktopError(caught, "first-run-player-hiscores", "GC-PROVIDER-001");
        updateStage(
          "hiscores",
          "failed",
          `${failure.code}; trace ${failure.traceId}. No demo levels were substituted.`,
        );
      }

      for (const catalogue of CATALOGUES) {
        if (!(await populateCatalogue(catalogue))) optionalFailures += 1;
      }
      if (!(await checkHistoryProviders())) optionalFailures += 1;
      if (!(await checkMarketEngine(activeProfile.id))) optionalFailures += 1;
      if (!(await verifyProvenance())) optionalFailures += 1;

      updateStage(
        "ready",
        "complete",
        optionalFailures === 0
          ? "All required runtime and data boundaries are ready"
          : `Ready with ${optionalFailures} limited capability warning${optionalFailures === 1 ? "" : "s"}`,
      );
      if (optionalFailures === 0) {
        continueWith(activeProfile);
      } else {
        setLimitedReady(true);
      }
    } catch (caught) {
      const failure = desktopError(caught, "first-run-critical", "GC-DB-001");
      updateStage(activeStage.current, "failed", `${failure.code}; trace ${failure.traceId}`);
      setError(`${failure.userMessage} (${failure.code}; trace ${failure.traceId})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell" id="main-content">
      <RuntimeDataBanner runtime={runtime} />
      <section className="onboarding-story" aria-labelledby="welcome-title">
        <div className="onboarding-brand">
          <span className="brand-mark large" aria-hidden="true">
            <i />
          </span>
          <span>Gielinor Companion</span>
        </div>
        <div className="story-content">
          <p className="eyebrow">Your journey, clearly mapped</p>
          <h1 id="welcome-title">Plan with confidence. Play your own way.</h1>
          <p>
            A private, read-only companion for quests, skills and the Grand Exchange. No login. No
            automation. No AI required.
          </p>
          <div className="safety-grid">
            <article>
              <Icon name="check" />
              <div>
                <strong>Public data only</strong>
                <span>Hiscores and documented community sources.</span>
              </div>
            </article>
            <article>
              <Icon name="check" />
              <div>
                <strong>Local by default</strong>
                <span>Your profile stays on this computer.</span>
              </div>
            </article>
            <article>
              <Icon name="check" />
              <div>
                <strong>Zero game control</strong>
                <span>Never clicks, types, trades or reads the client.</span>
              </div>
            </article>
          </div>
        </div>
        <p className="legal-note">Unofficial community project. Not affiliated with Jagex Ltd.</p>
      </section>
      <section className="onboarding-panel" aria-labelledby="setup-title">
        <div className="step-marker">
          <span>01</span>
          <i />
          <span className="muted">02</span>
        </div>
        <p className="eyebrow">First-run setup</p>
        <h2 id="setup-title">Add your public display name</h2>
        <p>
          This is used only to read public RuneScape Hiscores. Your account credentials are never
          requested.
        </p>
        {runtime?.ready === false ? (
          <InlineAlert tone="error">{runtime.message}</InlineAlert>
        ) : null}
        {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
        {busy || stages.some((stage) => stage.status !== "pending") ? (
          <ol className="setup-progress" aria-label="First-run setup progress" aria-live="polite">
            {stages.map((stage) => (
              <li key={stage.id} data-status={stage.status}>
                <span className="setup-stage-indicator" aria-hidden="true">
                  {stage.status === "complete"
                    ? "✓"
                    : stage.status === "failed"
                      ? "!"
                      : stage.status === "active"
                        ? "•"
                        : ""}
                </span>
                <span>
                  <strong>{stage.label}</strong>
                  {stage.detail === undefined ? null : <small>{stage.detail}</small>}
                </span>
                {stage.status === "failed" &&
                !["runtime", "database", "profile"].includes(stage.id) ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void retryStage(stage.id)}
                  >
                    Retry
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        <form className="setup-form" onSubmit={submit} noValidate>
          <label>
            RuneScape display name
            <input
              autoFocus
              autoComplete="off"
              maxLength={12}
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              placeholder="Your display name"
              aria-describedby="display-name-hint"
              disabled={busy || profile !== undefined}
            />
          </label>
          <small id="display-name-hint">1–12 public display-name characters.</small>
          <fieldset disabled={busy || profile !== undefined}>
            <legend>Account mode</legend>
            <div className="segmented-control">
              {[
                ["normal", "Normal"],
                ["ironman", "Ironman"],
                ["hardcore-ironman", "Hardcore"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="game-mode"
                    value={value}
                    checked={gameMode === value}
                    onChange={() => setGameMode(value as typeof gameMode)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="primary-button wide"
            type="submit"
            disabled={busy || profile !== undefined || runtime?.ready === false}
          >
            {busy ? <span className="spinner small" aria-hidden="true" /> : null}
            {busy ? "Synchronising real data…" : "Continue to companion"}
            {busy ? null : <Icon name="chevron" />}
          </button>
          {limitedReady && profile !== undefined ? (
            <button
              className="secondary-button wide"
              type="button"
              onClick={() => continueWith(profile)}
            >
              Continue with limited functionality
            </button>
          ) : null}
        </form>
        <div className="privacy-callout">
          <Icon name="about" />
          <p>
            We will never ask for your password, email, authenticator code, session token or bank
            PIN.
          </p>
        </div>
      </section>
    </main>
  );
}
