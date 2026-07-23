import type { DesktopProfile, LocalGoal, RuntimeStatus } from "../types.js";

export const VIEW_IDS = [
  "dashboard",
  "profiles",
  "skills",
  "quests",
  "levelling",
  "exchange",
  "shopping",
  "goals",
  "data-status",
  "updates",
  "settings",
  "ai-providers",
  "about",
] as const;

export type ViewId = (typeof VIEW_IDS)[number];
export type ThemePreference = "dark" | "light" | "system";

export type AppState = {
  activeView: ViewId;
  sidebarOpen: boolean;
  profiles: DesktopProfile[];
  selectedProfileId?: string;
  runtime?: RuntimeStatus;
  loading: boolean;
  notice?: { tone: "info" | "success" | "error"; message: string };
  theme: ThemePreference;
  compactMode: boolean;
  offlineMode: boolean;
  goals: LocalGoal[];
};

export type AppAction =
  | { type: "navigate"; view: ViewId }
  | { type: "toggle-sidebar" }
  | { type: "set-profiles"; profiles: DesktopProfile[]; selectedProfileId?: string }
  | { type: "select-profile"; profileId: string }
  | { type: "set-runtime"; runtime: RuntimeStatus }
  | { type: "set-loading"; loading: boolean }
  | { type: "notice"; notice?: AppState["notice"] }
  | { type: "set-theme"; theme: ThemePreference }
  | { type: "set-compact"; compactMode: boolean }
  | { type: "set-offline"; offlineMode: boolean }
  | { type: "add-goal"; goal: LocalGoal }
  | { type: "toggle-goal"; goalId: string }
  | { type: "remove-goal"; goalId: string };

type PersistedState = Pick<AppState, "theme" | "compactMode" | "offlineMode" | "goals">;

const STORAGE_KEY = "gielinor-companion-desktop-v1";

function readPersistedState(): Partial<PersistedState> {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === null) {
      return {};
    }
    const parsed = JSON.parse(value) as Partial<PersistedState>;
    return {
      ...(parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system"
        ? { theme: parsed.theme }
        : {}),
      ...(typeof parsed.compactMode === "boolean" ? { compactMode: parsed.compactMode } : {}),
      ...(typeof parsed.offlineMode === "boolean" ? { offlineMode: parsed.offlineMode } : {}),
      ...(Array.isArray(parsed.goals) ? { goals: parsed.goals } : {}),
    };
  } catch {
    return {};
  }
}

export function initialAppState(): AppState {
  const persisted = readPersistedState();
  return {
    activeView: "dashboard",
    sidebarOpen: false,
    profiles: [],
    loading: true,
    theme: persisted.theme ?? "dark",
    compactMode: persisted.compactMode ?? false,
    offlineMode: persisted.offlineMode ?? false,
    goals: persisted.goals ?? [],
  };
}

function withoutNotice(state: AppState): AppState {
  const next = { ...state };
  delete next.notice;
  return next;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "navigate": {
      return { ...withoutNotice(state), activeView: action.view, sidebarOpen: false };
    }
    case "toggle-sidebar":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "set-profiles": {
      const selectedProfileId =
        action.selectedProfileId ?? state.selectedProfileId ?? action.profiles[0]?.id;
      const nextState = {
        ...state,
        profiles: action.profiles,
      };
      return selectedProfileId === undefined ? nextState : { ...nextState, selectedProfileId };
    }
    case "select-profile":
      return { ...state, selectedProfileId: action.profileId };
    case "set-runtime":
      return { ...state, runtime: action.runtime };
    case "set-loading":
      return { ...state, loading: action.loading };
    case "notice": {
      if (action.notice === undefined) {
        return withoutNotice(state);
      }
      return { ...state, notice: action.notice };
    }
    case "set-theme":
      return { ...state, theme: action.theme };
    case "set-compact":
      return { ...state, compactMode: action.compactMode };
    case "set-offline":
      return { ...state, offlineMode: action.offlineMode };
    case "add-goal":
      return { ...state, goals: [action.goal, ...state.goals] };
    case "toggle-goal":
      return {
        ...state,
        goals: state.goals.map((goal) =>
          goal.id === action.goalId ? { ...goal, completed: !goal.completed } : goal,
        ),
      };
    case "remove-goal":
      return { ...state, goals: state.goals.filter((goal) => goal.id !== action.goalId) };
  }
}

export function persistAppState(state: AppState): void {
  const value: PersistedState = {
    theme: state.theme,
    compactMode: state.compactMode,
    offlineMode: state.offlineMode,
    goals: state.goals,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
