import { useRef, useState, type FormEvent } from "react";

import type { CompanionBridge, DataStatus, DesktopProfile, RuntimeStatus } from "../types.js";
import { InlineAlert } from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { desktopError } from "../lib/errors.js";
import { CreateProfileFormSchema, firstError } from "../lib/validation.js";

type SetupStageId =
  "database" | "statistics" | "quests" | "training" | "prices" | "validation" | "ready";

type SetupStage = {
  id: SetupStageId;
  label: string;
  status: "pending" | "active" | "complete" | "failed";
  detail?: string;
};

const INITIAL_STAGES: readonly SetupStage[] = [
  { id: "database", label: "Preparing local database", status: "pending" },
  { id: "statistics", label: "Refreshing player statistics", status: "pending" },
  { id: "quests", label: "Synchronising quest catalogue", status: "pending" },
  { id: "training", label: "Synchronising training methods", status: "pending" },
  { id: "prices", label: "Synchronising Grand Exchange item catalogue", status: "pending" },
  { id: "validation", label: "Validating local data", status: "pending" },
  { id: "ready", label: "Ready", status: "pending" },
];

const CATALOGUES = [
  {
    id: "quests",
    statusTool: "get_quest_data_status",
    refreshTool: "refresh_quest_data",
    count: (status: DataStatus) => status.questCount ?? 0,
  },
  {
    id: "training",
    statusTool: "get_training_data_status",
    refreshTool: "refresh_training_data",
    count: (status: DataStatus) => status.methodCount ?? 0,
  },
  {
    id: "prices",
    statusTool: "get_price_data_status",
    refreshTool: "refresh_price_data",
    count: (status: DataStatus) => status.itemCount ?? 0,
  },
] as const;

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
  const [profile, setProfile] = useState<DesktopProfile>();
  const [stages, setStages] = useState<SetupStage[]>(() =>
    INITIAL_STAGES.map((stage) => ({ ...stage })),
  );
  const continued = useRef(false);

  function updateStage(id: SetupStageId, status: SetupStage["status"], detail?: string): void {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, status, ...(detail === undefined ? {} : { detail }) } : stage,
      ),
    );
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
      const status = await bridge.callTool<DataStatus>(catalogue.statusTool, {});
      if (status.data.state === "ready" && catalogue.count(status.data) > 0) {
        updateStage(catalogue.id, "complete", "Validated local catalogue retained");
        return true;
      }
      await bridge.callTool(catalogue.refreshTool, {});
      updateStage(catalogue.id, "complete", "Catalogue synchronised");
      return true;
    } catch (caught) {
      const failure = desktopError(caught, `first-run-${catalogue.id}`, "GC-SYNC-001");
      updateStage(
        catalogue.id,
        "failed",
        `${failure.code}; trace ${failure.traceId}. Other sections remain available.`,
      );
      return false;
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
    setProfile(undefined);
    continued.current = false;
    setStages(INITIAL_STAGES.map((stage) => ({ ...stage })));
    setError(undefined);
    try {
      updateStage("database", "active");
      const created = await bridge.callTool<DesktopProfile>("create_player_profile", parsed.data);
      let profile = created.data;
      setProfile(profile);
      updateStage("database", "complete", "Local profile storage is ready");
      updateStage("statistics", "active");
      try {
        const refreshed = await bridge.callTool<DesktopProfile>("refresh_player_stats", {
          profileId: profile.id,
        });
        profile = refreshed.data;
        setProfile(profile);
        updateStage("statistics", "complete", "Public Hiscores refreshed");
      } catch (caught) {
        const failure = desktopError(caught, "first-run-player-statistics", "GC-PROVIDER-001");
        updateStage(
          "statistics",
          "failed",
          `${failure.code}; trace ${failure.traceId}. The local profile remains usable.`,
        );
      }
      const catalogueResults = await Promise.all(
        CATALOGUES.map((catalogue) => populateCatalogue(catalogue)),
      );
      updateStage("validation", "active");
      const completed = catalogueResults.filter(Boolean).length;
      updateStage(
        "validation",
        "complete",
        completed === CATALOGUES.length
          ? "All local catalogues validated"
          : `${completed} of ${CATALOGUES.length} catalogues ready; valid partial data preserved`,
      );
      updateStage(
        "ready",
        "complete",
        completed === CATALOGUES.length
          ? "Setup completed"
          : "Setup completed with optional provider warnings",
      );
      continueWith(profile);
    } catch (caught) {
      const failure = desktopError(caught, "first-run-profile", "GC-DB-001");
      updateStage("database", "failed", `${failure.code}; trace ${failure.traceId}`);
      setError(`${failure.userMessage} (${failure.code}; trace ${failure.traceId})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell" id="main-content">
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
              disabled={busy}
            />
          </label>
          <small id="display-name-hint">1–12 public display-name characters.</small>
          <fieldset>
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
                    disabled={busy}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="primary-button wide"
            type="submit"
            disabled={busy || runtime?.ready === false}
          >
            {busy ? <span className="spinner small" aria-hidden="true" /> : null}
            {busy ? "Creating local profile…" : "Continue to companion"}
            {busy ? null : <Icon name="chevron" />}
          </button>
          {busy && profile !== undefined ? (
            <button
              className="secondary-button wide"
              type="button"
              onClick={() => continueWith(profile)}
            >
              Continue with available data
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
