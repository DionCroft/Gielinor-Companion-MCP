import type {
  GrandExchangeDataProvider,
  PlayerStatsProvider,
  QuestDataProvider,
  TrainingMethodProvider,
} from "@gielinor/core";
import { describe, expect, it } from "vitest";

import { createBuiltinProviderPlugin } from "../src/builtin-plugin.js";
import {
  PROVIDER_CAPABILITIES,
  PROVIDER_PLUGIN_API_VERSION,
  ProviderRegistry,
} from "../src/plugin.js";

describe("Version 1 provider plugin interface", () => {
  it("publishes a versioned, complete built-in capability contract", () => {
    const plugin = createBuiltinProviderPlugin({
      stats: {} as PlayerStatsProvider,
      prices: {} as GrandExchangeDataProvider,
      quests: {} as QuestDataProvider,
      training: {} as TrainingMethodProvider,
    });

    expect(PROVIDER_PLUGIN_API_VERSION).toBe(1);
    expect(plugin.apiVersion).toBe(PROVIDER_PLUGIN_API_VERSION);
    expect(plugin.version).toBe("1.1.0");
    expect(plugin.capabilities.map((capability) => capability.capability)).toEqual(
      PROVIDER_CAPABILITIES,
    );
    expect(
      plugin.capabilities.every((capability) => Number.isSafeInteger(capability.priority)),
    ).toBe(true);
  });

  it("exposes deterministic metadata after registration", () => {
    const plugin = createBuiltinProviderPlugin({
      stats: {} as PlayerStatsProvider,
      prices: {} as GrandExchangeDataProvider,
      quests: {} as QuestDataProvider,
      training: {} as TrainingMethodProvider,
    });
    const registry = new ProviderRegistry();
    registry.register(plugin);

    expect(registry.capabilities()).toHaveLength(PROVIDER_CAPABILITIES.length);
    expect(registry.health.snapshot()).toHaveLength(PROVIDER_CAPABILITIES.length);
    expect(registry.capabilities()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: plugin.id,
          pluginVersion: "1.1.0",
          offlineSupport: "cache",
        }),
      ]),
    );
  });
});
