import { useState, type FormEvent } from "react";

import type { CompanionBridge, DesktopProfile, RuntimeStatus } from "../types.js";
import { InlineAlert } from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { CreateProfileFormSchema, firstError } from "../lib/validation.js";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CreateProfileFormSchema.safeParse({ displayName, gameMode });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const created = await bridge.callTool<DesktopProfile>("create_player_profile", parsed.data);
      let profile = created.data;
      try {
        const refreshed = await bridge.callTool<DesktopProfile>("refresh_player_stats", {
          profileId: profile.id,
        });
        profile = refreshed.data;
      } catch {
        // A valid local profile remains useful offline; the dashboard explains refresh state.
      }
      onComplete(profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The profile could not be created");
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
