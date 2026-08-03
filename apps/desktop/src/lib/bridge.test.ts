import {
  BrowserLiveDevelopmentBridge,
  createDefaultBridge,
  TauriCompanionBridge,
} from "./native-bridge.js";
import { DemoCompanionBridge } from "./bridge.js";

describe("desktop runtime boundaries", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("does not silently select fixtures during ordinary browser startup", async () => {
    const bridge = createDefaultBridge();

    expect(bridge).toBeInstanceOf(BrowserLiveDevelopmentBridge);
    await expect(bridge.runtimeStatus()).resolves.toMatchObject({
      ready: false,
      mode: "browser-live-development",
      transport: "unavailable",
    });
    await expect(
      bridge.callTool("refresh_player_stats", { profileId: "profile-1" }),
    ).rejects.toThrow(/standalone browser/i);
  });

  it("does not treat a fixture name without an explicit runtime mode as test mode", () => {
    window.history.replaceState({}, "", "/?fixture=returning");

    expect(createDefaultBridge()).toBeInstanceOf(BrowserLiveDevelopmentBridge);
  });

  it("keeps deterministic preview data in its explicit preview-only bridge", async () => {
    const bridge = new DemoCompanionBridge("returning", "browser-preview");
    await expect(bridge.runtimeStatus()).resolves.toMatchObject({
      ready: true,
      mode: "browser-preview",
    });
    const profiles = await bridge.callTool<Array<{ displayName: string }>>(
      "list_player_profiles",
      {},
    );
    expect(profiles.meta.source).toMatch(/fixture|preview/i);
    expect(profiles.data[0]?.displayName).toBe("Demo Adventurer");
  });

  it("labels automated fixtures only when automated-test is explicitly constructed", async () => {
    const bridge = new DemoCompanionBridge("returning", "automated-test");
    await expect(bridge.runtimeStatus()).resolves.toMatchObject({
      ready: true,
      mode: "automated-test",
    });
  });

  it("reports missing fixture profiles instead of substituting another profile", async () => {
    const bridge = new DemoCompanionBridge("first-run");

    await expect(
      bridge.callTool("refresh_player_stats", { profileId: "missing-profile" }),
    ).rejects.toThrow(/profile was not found/i);
  });

  it("selects the native bridge through Tauri's supported runtime marker", () => {
    vi.stubGlobal("isTauri", true);

    expect(createDefaultBridge()).toBeInstanceOf(TauriCompanionBridge);
  });
});
