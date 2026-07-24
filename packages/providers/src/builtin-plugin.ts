import type {
  GrandExchangeDataProvider,
  PlayerStatsProvider,
  QuestDataProvider,
  TrainingMethodProvider,
} from "@gielinor/core";

import {
  PROVIDER_PLUGIN_API_VERSION,
  type AnyProviderCapabilityRegistration,
  type ProviderPlugin,
} from "./plugin.js";

export type BuiltinProviderPluginOptions = {
  stats: PlayerStatsProvider;
  prices: GrandExchangeDataProvider;
  quests: QuestDataProvider;
  training: TrainingMethodProvider;
  priority?: number;
};

export function createBuiltinProviderPlugin(options: BuiltinProviderPluginOptions): ProviderPlugin {
  const priority = options.priority ?? 100;
  const capabilities: AnyProviderCapabilityRegistration[] = [
    {
      capability: "player-stats",
      priority,
      offlineSupport: "cache",
      description: "Public RuneScape Hiscores with retained stale-cache support",
      handler: ({ displayName, gameMode }, context) =>
        options.stats.getPlayerStats(displayName, gameMode, {
          forceRefresh: context.forceRefresh,
          offline: context.offline,
        }),
    },
    {
      capability: "current-price",
      priority,
      offlineSupport: "cache",
      description: "Current Jagex Grand Exchange guide prices with retained cache support",
      handler: ({ itemId }, context) =>
        options.prices.getCurrentPrice(itemId, {
          forceRefresh: context.forceRefresh,
          offline: context.offline,
        }),
    },
    {
      capability: "price-history",
      priority,
      offlineSupport: "cache",
      description: "Jagex Grand Exchange guide-price history with retained cache support",
      handler: ({ itemId, range }, context) =>
        options.prices.getPriceHistory(itemId, range, {
          forceRefresh: context.forceRefresh,
          offline: context.offline,
        }),
    },
    {
      capability: "price-snapshot",
      priority,
      offlineSupport: "none",
      description: "Validated Grand Exchange catalogue synchronization",
      handler: () => options.prices.fetchSnapshot(),
    },
    {
      capability: "quest-snapshot",
      priority,
      offlineSupport: "none",
      description: "Revision-aware RuneScape Wiki quest synchronization",
      handler: () => options.quests.fetchSnapshot(),
    },
    {
      capability: "training-snapshot",
      priority,
      offlineSupport: "none",
      description: "Structured RuneScape Wiki training-method synchronization",
      handler: () => options.training.fetchSnapshot(),
    },
  ];
  return {
    apiVersion: PROVIDER_PLUGIN_API_VERSION,
    id: "gielinor.builtin-public-data",
    name: "Gielinor built-in public data providers",
    version: "1.0.0",
    capabilities,
  };
}
