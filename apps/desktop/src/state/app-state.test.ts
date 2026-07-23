import { appReducer, initialAppState, persistAppState } from "./app-state.js";

describe("desktop application state", () => {
  it("navigates, closes the sidebar and clears a notice", () => {
    const state = {
      ...initialAppState(),
      sidebarOpen: true,
      notice: { tone: "info" as const, message: "Saved" },
    };

    const next = appReducer(state, { type: "navigate", view: "quests" });

    expect(next.activeView).toBe("quests");
    expect(next.sidebarOpen).toBe(false);
    expect(next).not.toHaveProperty("notice");
  });

  it("selects the first available profile", () => {
    const state = initialAppState();
    const profile = {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Test Player",
      gameMode: "normal" as const,
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    };

    const next = appReducer(state, { type: "set-profiles", profiles: [profile] });

    expect(next.selectedProfileId).toBe(profile.id);
  });

  it("persists local preferences and goals", () => {
    const state = appReducer(initialAppState(), {
      type: "add-goal",
      goal: {
        id: "goal-1",
        title: "Complete a quest",
        target: "Plague's End",
        completed: false,
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    });
    persistAppState(state);

    expect(initialAppState().goals).toHaveLength(1);
  });
});
