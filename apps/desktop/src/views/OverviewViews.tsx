import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ProfileExport } from "@gielinor/shared-types";

import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  StatusPill,
} from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { formatDate, formatNumber, titleCase } from "../lib/format.js";
import { CreateProfileFormSchema, firstError } from "../lib/validation.js";
import type { ViewId } from "../state/app-state.js";
import type { CompanionBridge, DesktopProfile } from "../types.js";

export function DashboardView({
  profile,
  goalsRemaining,
  onNavigate,
}: {
  profile: DesktopProfile;
  goalsRemaining: number;
  onNavigate: (view: ViewId) => void;
}) {
  const totalLevel = profile.skills.reduce((total, skill) => total + skill.level, 0);
  const highest = [...profile.skills].sort((left, right) => right.level - left.level)[0];
  const completedQuests = profile.completedQuestIds.length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Command centre"
        title={`Welcome back, ${profile.displayName}`}
        description="A calm overview of your public progress and local plans."
        actions={
          <StatusPill state="ready">
            <span className="runtime-dot ready" />
            Local & read-only
          </StatusPill>
        }
      />
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-kicker">Suggested next step</span>
          <h2>Turn your next level into a route you can actually follow.</h2>
          <p>
            Compare training methods by time, cost and attention—then keep the plan beside your
            quest route.
          </p>
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => onNavigate("levelling")}
            >
              Build a levelling plan
              <Icon name="chevron" />
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate("quests")}>
              Open quest planner
            </button>
          </div>
        </div>
        <div className="hero-compass" aria-hidden="true">
          <span />
          <i />
        </div>
      </section>
      <section className="metrics-grid" aria-label="Profile summary">
        <MetricCard
          label="Total level"
          value={formatNumber(totalLevel)}
          detail={`${profile.skills.length} public skills tracked`}
          accent="mint"
        />
        <MetricCard
          label="Highest skill"
          value={highest === undefined ? "Refresh needed" : `Level ${highest.level}`}
          detail={highest === undefined ? "No Hiscores snapshot" : titleCase(highest.skillId)}
          accent="gold"
        />
        <MetricCard
          label="Quest progress"
          value={formatNumber(completedQuests)}
          detail="Manually marked complete"
          accent="blue"
        />
        <MetricCard
          label="Active goals"
          value={formatNumber(goalsRemaining)}
          detail="Stored on this computer"
          accent="rose"
        />
      </section>
      <div className="content-grid two-thirds">
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recent progress</p>
              <h2>Skill snapshot</h2>
            </div>
            <button className="text-button" type="button" onClick={() => onNavigate("skills")}>
              View all
              <Icon name="chevron" size={16} />
            </button>
          </div>
          {profile.skills.length === 0 ? (
            <EmptyState
              title="No public stats yet"
              description="Refresh this profile when a network connection is available."
            />
          ) : (
            <div className="skill-preview-list">
              {[...profile.skills]
                .sort((left, right) => right.level - left.level)
                .slice(0, 6)
                .map((skill) => (
                  <div className="skill-preview" key={skill.skillId}>
                    <span className="skill-glyph">{skill.skillId.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{titleCase(skill.skillId)}</strong>
                      <span>{formatNumber(skill.experience)} XP</span>
                    </div>
                    <b>{skill.level}</b>
                  </div>
                ))}
            </div>
          )}
        </section>
        <aside className="surface-card profile-snapshot">
          <p className="eyebrow">Profile snapshot</p>
          <div className="large-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>
          <h2>{profile.displayName}</h2>
          <StatusPill state="neutral">{titleCase(profile.gameMode)}</StatusPill>
          <dl>
            <div>
              <dt>Last Hiscores refresh</dt>
              <dd>{formatDate(profile.lastHiscoresRefresh)}</dd>
            </div>
            <div>
              <dt>Planning style</dt>
              <dd>{titleCase(profile.preferredPlayStyle ?? "balanced")}</dd>
            </div>
            <div>
              <dt>Daily time</dt>
              <dd>{profile.availableHoursPerDay ?? "Not set"} hours</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

export function ProfilesView({
  bridge,
  profiles,
  selectedProfileId,
  onProfilesChanged,
  onSelect,
}: {
  bridge: CompanionBridge;
  profiles: DesktopProfile[];
  selectedProfileId?: string;
  onProfilesChanged: (profiles: DesktopProfile[]) => void;
  onSelect: (profileId: string) => void;
}) {
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [gameMode, setGameMode] = useState<"normal" | "ironman" | "hardcore-ironman">("normal");
  const importInput = useRef<HTMLInputElement>(null);

  async function refresh(profile: DesktopProfile) {
    setBusyId(profile.id);
    setMessage(undefined);
    try {
      const result = await bridge.callTool<DesktopProfile>("refresh_player_stats", {
        profileId: profile.id,
      });
      onProfilesChanged(
        profiles.map((candidate) => (candidate.id === profile.id ? result.data : candidate)),
      );
      setMessage(`Public stats refreshed for ${profile.displayName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stats refresh failed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CreateProfileFormSchema.safeParse({ displayName, gameMode });
    if (!parsed.success) {
      setMessage(firstError(parsed.error));
      return;
    }
    setBusyId("create");
    setMessage(undefined);
    try {
      const created = await bridge.callTool<DesktopProfile>("create_player_profile", parsed.data);
      onProfilesChanged([created.data, ...profiles]);
      onSelect(created.data.id);
      setDisplayName("");
      setGameMode("normal");
      setAdding(false);
      setMessage(`${created.data.displayName} was added locally.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The profile could not be created");
    } finally {
      setBusyId(undefined);
    }
  }

  async function exportProfile(profile: DesktopProfile) {
    setBusyId(profile.id);
    setMessage(undefined);
    try {
      const exported = await bridge.callTool<ProfileExport>("export_player_profile", {
        profileId: profile.id,
      });
      const blob = new Blob([`${JSON.stringify(exported.data, null, 2)}\n`], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${profile.displayName.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}-profile.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Portable profile exported for ${profile.displayName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The profile could not be exported");
    } finally {
      setBusyId(undefined);
    }
  }

  async function importProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) {
      return;
    }
    setBusyId("import");
    setMessage(undefined);
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const imported = await bridge.callTool<DesktopProfile>("import_player_profile", {
        profile: payload,
      });
      onProfilesChanged([imported.data, ...profiles]);
      onSelect(imported.data.id);
      setMessage(`${imported.data.displayName} was imported and validated.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? `Import failed: ${error.message}` : "The profile import failed",
      );
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Local identities"
        title="Player profiles"
        description="Switch between public display names without storing account credentials."
        actions={
          <div className="button-row">
            <input
              ref={importInput}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importProfile(event)}
            />
            <button
              className="secondary-button"
              type="button"
              disabled={busyId !== undefined}
              onClick={() => importInput.current?.click()}
            >
              Import profile
            </button>
            <button className="primary-button" type="button" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Add profile
            </button>
          </div>
        }
      />
      {message === undefined ? null : <InlineAlert tone="info">{message}</InlineAlert>}
      <section className="profile-card-grid">
        {profiles.map((profile) => (
          <article
            className={profile.id === selectedProfileId ? "profile-card selected" : "profile-card"}
            key={profile.id}
          >
            <div className="profile-card-top">
              <span className="large-avatar small">{profile.displayName.slice(0, 1)}</span>
              {profile.id === selectedProfileId ? (
                <StatusPill state="success">Active</StatusPill>
              ) : null}
            </div>
            <h2>{profile.displayName}</h2>
            <p>{titleCase(profile.gameMode)} account</p>
            <dl>
              <div>
                <dt>Skills</dt>
                <dd>{profile.skills.length}/29</dd>
              </div>
              <div>
                <dt>Quest statuses</dt>
                <dd>{profile.completedQuestIds.length + profile.inProgressQuestIds.length}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                disabled={profile.id === selectedProfileId}
                onClick={() => onSelect(profile.id)}
              >
                {profile.id === selectedProfileId ? "Selected" : "Use profile"}
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Refresh ${profile.displayName}`}
                disabled={busyId !== undefined}
                onClick={() => void refresh(profile)}
              >
                <Icon name="refresh" className={busyId === profile.id ? "spin" : ""} />
              </button>
              <button
                className="text-button"
                type="button"
                disabled={busyId !== undefined}
                onClick={() => void exportProfile(profile)}
              >
                Export
              </button>
            </div>
          </article>
        ))}
        <article className="profile-card add-profile-card">
          <Icon name="profiles" size={30} />
          <h2>Add another profile</h2>
          <p>Multiple profiles share the same validated public-data catalogues.</p>
          <button className="secondary-button" type="button" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add profile
          </button>
        </article>
      </section>
      {adding ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdding(false)}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-profile-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Local profile</p>
                <h2 id="add-profile-title">Add another player</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close profile form"
                onClick={() => setAdding(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <form className="stacked-form" onSubmit={createProfile} noValidate>
              <label>
                RuneScape display name
                <input
                  autoFocus
                  maxLength={12}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                />
              </label>
              <label>
                Account mode
                <select
                  value={gameMode}
                  onChange={(event) => setGameMode(event.currentTarget.value as typeof gameMode)}
                >
                  <option value="normal">Normal</option>
                  <option value="ironman">Ironman</option>
                  <option value="hardcore-ironman">Hardcore Ironman</option>
                </select>
              </label>
              <button className="primary-button wide" type="submit" disabled={busyId !== undefined}>
                {busyId === "create" ? "Creating profile…" : "Create local profile"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function SkillsView({
  bridge,
  profile,
}: {
  bridge: CompanionBridge;
  profile: DesktopProfile;
}) {
  const [selectedSkill, setSelectedSkill] = useState(profile.skills[0]?.skillId ?? "attack");
  const [targetLevel, setTargetLevel] = useState(99);
  const [progress, setProgress] = useState<{
    currentLevel: number;
    targetLevel: number;
    experienceRemaining: number;
    progressPercent: number;
  }>();
  const [error, setError] = useState<string>();

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const result = await bridge.callTool<typeof progress>("get_skill_progress", {
        profileId: profile.id,
        skillId: selectedSkill,
        targetLevel,
      });
      setProgress(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Progress could not be calculated");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Public Hiscores"
        title="Skills"
        description={`Explore ${profile.displayName}'s latest public snapshot and calculate exact targets.`}
        actions={
          <StatusPill state="fresh">Updated {formatDate(profile.lastHiscoresRefresh)}</StatusPill>
        }
      />
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      <div className="content-grid two-thirds">
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">All skills</p>
              <h2>Level overview</h2>
            </div>
          </div>
          <div className="skill-table" role="table" aria-label="Skill levels">
            {profile.skills.map((skill) => (
              <button
                type="button"
                role="row"
                className={selectedSkill === skill.skillId ? "skill-row selected" : "skill-row"}
                key={skill.skillId}
                onClick={() => setSelectedSkill(skill.skillId)}
              >
                <span className="skill-glyph" role="cell">
                  {skill.skillId.slice(0, 2).toUpperCase()}
                </span>
                <span className="skill-name" role="cell">
                  <strong>{titleCase(skill.skillId)}</strong>
                  <small>{formatNumber(skill.experience)} XP</small>
                </span>
                <span className="skill-level" role="cell">
                  {skill.level}
                </span>
                <span className="level-track" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, skill.level)}%` }} />
                </span>
              </button>
            ))}
          </div>
        </section>
        <aside className="surface-card sticky-card">
          <p className="eyebrow">Exact XP calculator</p>
          <h2>{titleCase(selectedSkill)}</h2>
          <form className="stacked-form" onSubmit={calculate}>
            <label>
              Target level
              <input
                type="number"
                min={2}
                max={150}
                value={targetLevel}
                onChange={(event) => setTargetLevel(event.currentTarget.valueAsNumber)}
              />
            </label>
            <button className="primary-button wide" type="submit">
              Calculate progress
            </button>
          </form>
          {progress === undefined ? (
            <p className="muted-copy">Choose a skill and target to see exact XP remaining.</p>
          ) : (
            <div className="progress-result">
              <div>
                <span>Current</span>
                <strong>Level {progress.currentLevel}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{formatNumber(progress.experienceRemaining)} XP</strong>
              </div>
              <div className="progress-bar">
                <i style={{ width: `${progress.progressPercent}%` }} />
              </div>
              <small>{progress.progressPercent.toFixed(2)}% of target XP</small>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
