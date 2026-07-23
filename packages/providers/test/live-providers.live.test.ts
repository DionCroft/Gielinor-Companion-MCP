import { describe, expect, it } from "vitest";

import { MemoryCacheStore } from "../src/cache.js";
import { ResilientHttpClient } from "../src/http.js";
import { JagexGrandExchangeProvider } from "../src/jagex-ge.js";
import { JagexHiscoresProvider } from "../src/jagex-hiscores.js";

const live = process.env.RUN_LIVE_API_TESTS === "1";

describe.runIf(live)("live public provider smoke tests", () => {
  const httpClient = new ResilientHttpClient({
    userAgent:
      "Gielinor-Companion-MCP-live-test/0.7.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
  });

  it("reads a public Hiscores profile", async () => {
    const result = await new JagexHiscoresProvider({
      httpClient,
      cacheStore: new MemoryCacheStore(),
    }).getPlayerStats("Zezima");
    expect(result.skills).toHaveLength(29);
  });

  it("reads an RS3 ItemDB price", async () => {
    const result = await new JagexGrandExchangeProvider({
      httpClient,
      cacheStore: new MemoryCacheStore(),
    }).getCurrentPrice(4151);
    expect(result.name).toBe("Abyssal whip");
    expect(result.currentPrice).toBeGreaterThan(0);
  });

  it("reads the RS3 ItemDB graph and validated catalogue", async () => {
    const provider = new JagexGrandExchangeProvider({
      httpClient,
      cacheStore: new MemoryCacheStore(),
    });
    const history = await provider.getPriceHistory(4151, "30d");
    expect(history.length).toBeGreaterThan(20);
    expect(history.map((point) => point.timestamp)).toEqual(
      [...history].map((point) => point.timestamp).sort(),
    );
    const snapshot = await provider.fetchSnapshot();
    expect(snapshot.items.length).toBeGreaterThan(7_000);
    expect(snapshot.items.find((item) => item.itemId === 4151)).toMatchObject({
      name: "Abyssal whip",
      buyLimit: 10,
    });
  });
});
