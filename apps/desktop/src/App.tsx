import { useEffect, useMemo, useReducer } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { InlineAlert, LoadingBlock } from "./components/Common.js";
import { Layout } from "./components/Layout.js";
import { createDefaultBridge } from "./lib/native-bridge.js";
import { desktopError } from "./lib/errors.js";
import {
  appReducer,
  initialAppState,
  persistAppState,
  type AppState,
  type ViewId,
} from "./state/app-state.js";
import type { CompanionBridge, DesktopProfile } from "./types.js";
import { AiProvidersView } from "./views/AiProvidersView.js";
import { FirstRunView } from "./views/FirstRunView.js";
import { DashboardView, ProfilesView, SkillsView } from "./views/OverviewViews.js";
import {
  ExchangeView,
  GoalsView,
  LevellingView,
  QuestPlannerView,
  ShoppingListsView,
} from "./views/PlanningViews.js";
import {
  AboutView,
  DataStatusView,
  DiagnosticsView,
  SettingsView,
  UpdatesView,
} from "./views/SystemViews.js";

function activeContent(
  state: AppState,
  bridge: CompanionBridge,
  profile: DesktopProfile,
  dispatch: React.Dispatch<Parameters<typeof appReducer>[1]>,
) {
  const setOfflineMode = (offlineMode: boolean): void => {
    void bridge
      .callTool("set_offline_mode", { offline: offlineMode, confirmed: true })
      .then(() => dispatch({ type: "set-offline", offlineMode }));
  };
  const views: Record<ViewId, React.ReactNode> = {
    dashboard: (
      <DashboardView
        profile={profile}
        goalsRemaining={state.goals.filter((goal) => !goal.completed).length}
        onNavigate={(view) => dispatch({ type: "navigate", view })}
      />
    ),
    profiles: (
      <ProfilesView
        bridge={bridge}
        profiles={state.profiles}
        {...(state.selectedProfileId === undefined
          ? {}
          : { selectedProfileId: state.selectedProfileId })}
        onProfilesChanged={(profiles) => dispatch({ type: "set-profiles", profiles })}
        onSelect={(profileId) => {
          void bridge
            .callTool("set_selected_player_profile", { profileId })
            .then(() => dispatch({ type: "select-profile", profileId }));
        }}
      />
    ),
    skills: <SkillsView bridge={bridge} profile={profile} />,
    quests: <QuestPlannerView bridge={bridge} profile={profile} />,
    levelling: <LevellingView bridge={bridge} profile={profile} />,
    exchange: <ExchangeView bridge={bridge} profile={profile} />,
    shopping: <ShoppingListsView bridge={bridge} />,
    goals: (
      <GoalsView
        goals={state.goals}
        onAdd={(goal) => dispatch({ type: "add-goal", goal })}
        onToggle={(goalId) => dispatch({ type: "toggle-goal", goalId })}
        onRemove={(goalId) => dispatch({ type: "remove-goal", goalId })}
      />
    ),
    "data-status": <DataStatusView bridge={bridge} offlineMode={state.offlineMode} />,
    diagnostics: (
      <DiagnosticsView bridge={bridge} offlineMode={state.offlineMode} onOffline={setOfflineMode} />
    ),
    updates: <UpdatesView bridge={bridge} />,
    settings: (
      <SettingsView
        {...(state.runtime === undefined ? {} : { runtime: state.runtime })}
        theme={state.theme}
        compactMode={state.compactMode}
        offlineMode={state.offlineMode}
        onTheme={(theme) => dispatch({ type: "set-theme", theme })}
        onCompact={(compactMode) => dispatch({ type: "set-compact", compactMode })}
        onOffline={setOfflineMode}
      />
    ),
    "ai-providers": <AiProvidersView bridge={bridge} profile={profile} />,
    about: <AboutView />,
  };
  return views[state.activeView];
}

export function App({ bridge: providedBridge }: { bridge?: CompanionBridge }) {
  const bridge = useMemo(() => providedBridge ?? createDefaultBridge(), [providedBridge]);
  const [state, dispatch] = useReducer(appReducer, undefined, initialAppState);
  const selectedProfile =
    state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? state.profiles[0];

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [runtime, profiles] = await Promise.all([
          bridge.runtimeStatus(),
          bridge.callTool<DesktopProfile[]>("list_player_profiles", {}),
        ]);
        if (active) {
          let selectedProfileId: string | undefined;
          if (profiles.data.length > 0) {
            try {
              const selected = await bridge.callTool<{ profile: { id: string } }>(
                "get_selected_player_snapshot",
                {},
              );
              selectedProfileId = selected.data.profile.id;
            } catch {
              selectedProfileId = profiles.data[0]?.id;
              if (selectedProfileId !== undefined) {
                await bridge.callTool("set_selected_player_profile", {
                  profileId: selectedProfileId,
                });
              }
            }
          }
          dispatch({ type: "set-runtime", runtime });
          dispatch({
            type: "set-profiles",
            profiles: profiles.data,
            ...(selectedProfileId === undefined ? {} : { selectedProfileId }),
          });
        }
      } catch (error) {
        if (active) {
          const failure = desktopError(error, "initialise-runtime", "GC-CFG-002");
          dispatch({
            type: "set-runtime",
            runtime: {
              ready: false,
              mode: "unavailable",
              message: `${failure.userMessage} (${failure.code}; ${failure.traceId})`,
            },
          });
        }
      } finally {
        if (active) {
          dispatch({ type: "set-loading", loading: false });
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let dispose: (() => void) | undefined;
    void listen("gielinor://second-instance", () => {
      dispatch({
        type: "notice",
        notice: {
          tone: "info",
          message: "Gielinor Companion was already running, so this window was brought forward.",
        },
      });
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    persistAppState(state);
  }, [state.theme, state.compactMode, state.offlineMode, state.goals]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.colorScheme =
      state.theme === "system" ? "light dark" : state.theme;
  }, [state.theme]);

  if (state.loading) {
    return (
      <main className="splash-screen">
        <span className="brand-mark large" aria-hidden="true">
          <i />
        </span>
        <LoadingBlock label="Opening your local companion" />
      </main>
    );
  }

  if (state.profiles.length === 0) {
    return (
      <FirstRunView
        bridge={bridge}
        {...(state.runtime === undefined ? {} : { runtime: state.runtime })}
        onComplete={(profile) =>
          dispatch({
            type: "set-profiles",
            profiles: [profile],
            selectedProfileId: profile.id,
          })
        }
      />
    );
  }

  if (selectedProfile === undefined) {
    return (
      <main className="splash-screen">
        <InlineAlert tone="error">No usable local profile was found.</InlineAlert>
      </main>
    );
  }

  return (
    <Layout
      state={state}
      selectedProfileName={selectedProfile.displayName}
      onNavigate={(view) => dispatch({ type: "navigate", view })}
      onToggleSidebar={() => dispatch({ type: "toggle-sidebar" })}
    >
      {activeContent(state, bridge, selectedProfile, dispatch)}
    </Layout>
  );
}
