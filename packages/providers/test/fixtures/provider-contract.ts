import type { GrandExchangeItem } from "@gielinor/shared-types";

import type { ProviderPlugin } from "../../src/plugin.js";

export function fixturePrice(currentPrice: number, sourceName: string): GrandExchangeItem {
  return {
    itemId: 4151,
    name: "Abyssal whip",
    currentPrice,
    sourceName,
  };
}

export function fixturePricePlugin(options: {
  id: string;
  priority: number;
  currentPrice?: number;
  failure?: Error;
  offlineSupport?: "none" | "cache" | "full";
}): ProviderPlugin {
  return {
    id: options.id,
    name: options.id,
    version: "1.0.0",
    capabilities: [
      {
        capability: "current-price",
        priority: options.priority,
        offlineSupport: options.offlineSupport ?? "none",
        description: "Deterministic provider contract fixture",
        handler: async () => {
          if (options.failure !== undefined) {
            throw options.failure;
          }
          return fixturePrice(options.currentPrice ?? 1_000, options.id);
        },
      },
    ],
  };
}
