import { SKILL_IDS } from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { MemoryCacheStore } from "../src/cache.js";
import { ResilientHttpClient } from "../src/http.js";
import { JagexGrandExchangeProvider, parseCompactPrice } from "../src/jagex-ge.js";
import { parseHiscoresResponse } from "../src/jagex-hiscores.js";

describe("Jagex Hiscores parsing", () => {
  it("maps the documented skill row order", () => {
    const rows = ["1,3000,5000000000"];
    rows.push(...SKILL_IDS.map((_skill, index) => `${index + 1},${index + 1},${index * 1000}`));
    const skills = parseHiscoresResponse(rows.join("\n"));

    expect(skills).toHaveLength(SKILL_IDS.length);
    expect(skills[0]).toEqual({
      skillId: "attack",
      rank: 1,
      level: 1,
      experience: 0,
    });
    expect(skills.at(-1)?.skillId).toBe("necromancy");
  });

  it("rejects incomplete responses", () => {
    expect(() => parseHiscoresResponse("1,1,0\n1,1,0")).toThrow(/fewer skill rows/);
  });
});

describe("Jagex Grand Exchange provider", () => {
  it.each([
    [123, 123],
    ["12,345", 12_345],
    ["5.2m", 5_200_000],
    ["1.5b", 1_500_000_000],
  ])("normalizes %s to %i GP", (input, expected) => {
    expect(parseCompactPrice(input)).toBe(expected);
  });

  it("validates and caches ItemDB responses", async () => {
    let calls = 0;
    const fetchImplementation: typeof fetch = async () => {
      calls += 1;
      return Response.json({
        item: {
          id: 4151,
          name: "Abyssal whip",
          current: { price: "68.4k", trend: "neutral" },
        },
      });
    };
    const provider = new JagexGrandExchangeProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation,
      }),
      cacheStore: new MemoryCacheStore(),
      now: () => 1_700_000_000_000,
    });

    expect(await provider.getCurrentPrice(4151)).toMatchObject({
      itemId: 4151,
      name: "Abyssal whip",
      currentPrice: 68_400,
      cacheStatus: "miss",
    });
    expect(await provider.getCurrentPrice(4151)).toMatchObject({
      cacheStatus: "fresh",
    });
    expect(calls).toBe(1);
  });

  it("rejects malformed ItemDB responses", async () => {
    const provider = new JagexGrandExchangeProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: async () => Response.json({ item: {} }),
      }),
    });
    await expect(provider.getCurrentPrice(4151)).rejects.toMatchObject({
      code: "MALFORMED_PROVIDER_RESPONSE",
    });
  });
});
