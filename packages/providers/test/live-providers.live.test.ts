import { describe, expect, it } from "vitest";

import { MemoryCacheStore } from "../src/cache.js";
import { ResilientHttpClient } from "../src/http.js";
import { JagexGrandExchangeProvider } from "../src/jagex-ge.js";
import { JagexHiscoresProvider } from "../src/jagex-hiscores.js";

const live = process.env.RUN_LIVE_API_TESTS === "1";

describe.runIf(live)("live public provider smoke tests", () => {
  const httpClient = new ResilientHttpClient({
    userAgent:
      "Gielinor-Companion-MCP-live-test/0.3.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
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
});
