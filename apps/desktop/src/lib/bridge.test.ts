import { SKILL_IDS } from "@gielinor/shared-types";

import { createDefaultBridge, DemoCompanionBridge, TauriCompanionBridge } from "./bridge.js";

function hiscoresFixture(): string {
  const rows = ["1,2000,250000000"];
  for (const [index] of SKILL_IDS.entries()) {
    rows.push(`${1000 + index},${10 + index},${1000 + index * 100}`);
  }
  return rows.join("\n");
}

describe("browser development bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes the entered normal account from live Hiscores instead of demo skills", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => hiscoresFixture(),
    });
    vi.stubGlobal("fetch", fetchMock);
    const bridge = new DemoCompanionBridge("live");
    const created = await bridge.callTool<{ id: string }>("create_player_profile", {
      displayName: "vipergtrkin",
      gameMode: "normal",
    });

    const refreshed = await bridge.callTool<{
      displayName: string;
      gameMode: string;
      skills: Array<{ skillId: string; level: number; experience: number }>;
    }>("refresh_player_stats", {
      profileId: created.data.id,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/__gielinor/hiscores/normal?player=vipergtrkin",
      expect.objectContaining({ headers: { accept: "text/plain" } }),
    );
    expect(refreshed.meta.source).toMatch(/Jagex public Hiscores/i);
    expect(refreshed.data).toMatchObject({
      displayName: "vipergtrkin",
      gameMode: "normal",
    });
    expect(refreshed.data.skills).toHaveLength(29);
    expect(refreshed.data.skills[0]).toMatchObject({
      skillId: "attack",
      level: 10,
      experience: 1000,
    });
  });

  it("reports a missing live Hiscores account without falling back to demo progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "",
      }),
    );
    const bridge = new DemoCompanionBridge("live");
    const created = await bridge.callTool<{ id: string }>("create_player_profile", {
      displayName: "Missing Hero",
      gameMode: "normal",
    });

    await expect(
      bridge.callTool("refresh_player_stats", { profileId: created.data.id }),
    ).rejects.toThrow(/was not found on the normal Hiscores/i);
  });

  it("selects the native bridge through Tauri's supported runtime marker", () => {
    vi.stubGlobal("isTauri", true);

    expect(createDefaultBridge()).toBeInstanceOf(TauriCompanionBridge);
  });
});
