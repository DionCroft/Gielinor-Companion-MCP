import { describe, expect, it } from "vitest";

import { MemoryCacheStore } from "../src/cache.js";
import { ResilientHttpClient } from "../src/http.js";
import { WeirdGloopExchangeHistoryProvider } from "../src/weird-gloop-exchange.js";
import { WeirdGloopRuneScapeNewsProvider } from "../src/weird-gloop-news.js";

const live = process.env.RUN_LIVE_API_TESTS === "1";

describe.runIf(live)("live Weird Gloop RS3 market and news contracts", () => {
  const httpClient = new ResilientHttpClient({
    userAgent:
      "Gielinor-Companion-MCP-live-test/1.1.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
    timeoutMs: 30_000,
    retries: 1,
  });

  it("reads RS3 guide-price and volume history without using OSRS high/low data", async () => {
    const result = await new WeirdGloopExchangeHistoryProvider({
      httpClient,
      cacheStore: new MemoryCacheStore(),
    }).getHistory(4151, "30d", { forceRefresh: true });

    expect(result.sourceName).toContain("Weird Gloop RuneScape");
    expect(result.points.length).toBeGreaterThan(20);
    expect(result.points.every((point) => point.price > 0)).toBe(true);
    expect(result.points.some((point) => point.volume !== undefined)).toBe(true);
  });

  it("reads source-backed RuneScape news without deriving item causality", async () => {
    const result = await new WeirdGloopRuneScapeNewsProvider({
      httpClient,
      cacheStore: new MemoryCacheStore(),
    }).fetchNews({ forceRefresh: true });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.url.startsWith("https://"))).toBe(true);
    expect(result.items.every((item) => item.sourceName.includes("RuneScape"))).toBe(true);
  });
});
