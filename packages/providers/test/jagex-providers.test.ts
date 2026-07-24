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

  it("validates the bulk catalogue and preserves aliases, limits, alchemy, and volume", async () => {
    const bulk: Record<string, unknown> = {
      "%JAGEX_TIMESTAMP%": 1_700_000_000,
      "%UPDATE_DETECTED%": 1_700_000_100,
    };
    for (let id = 1; id <= 1_000; id += 1) {
      bulk[String(id)] = {
        id,
        name: id === 415 ? "Abyssal whip" : `Item ${id}`,
        name_pt: id === 415 ? "Chicote abissal" : null,
        examine: "Fixture item",
        members: id % 2 === 0,
        price: id * 10,
        last: id * 9,
        limit: 100,
        highalch: 60,
        lowalch: 40,
        value: 100,
        volume: 500,
      };
    }
    const provider = new JagexGrandExchangeProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: async () => Response.json(bulk),
      }),
      bulkEndpoint: "https://example.test/rs_dump.json",
      now: () => 1_700_000_200_000,
    });

    const snapshot = await provider.fetchSnapshot();
    expect(snapshot.items).toHaveLength(1_000);
    expect(snapshot.sourceRevision).toBe("1700000000");
    expect(snapshot.items.find((item) => item.itemId === 415)).toMatchObject({
      name: "Abyssal whip",
      aliases: ["Chicote abissal"],
      currentPrice: 4_150,
      previousPrice: 3_735,
      buyLimit: 100,
      alchemyValue: 60,
      lowAlchemyValue: 40,
      volume: 500,
    });
  });

  it("orders, filters, and caches official graph history while ignoring zero placeholders", async () => {
    let calls = 0;
    const provider = new JagexGrandExchangeProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: async () => {
          calls += 1;
          return Response.json({
            daily: {
              "1700172800000": 120,
              "1700000000000": 100,
              "1700086400000": 0,
            },
            average: {
              "1700172800000": 110,
              "1700000000000": 90,
              "1700086400000": 95,
            },
          });
        },
      }),
      graphEndpoint: "https://example.test/graph/",
      cacheStore: new MemoryCacheStore(),
      now: () => 1_700_200_000_000,
    });

    const points = await provider.getPriceHistory(4151, "7d");
    expect(points).toEqual([
      {
        timestamp: "2023-11-14T22:13:20.000Z",
        price: 100,
        averagePrice: 90,
      },
      {
        timestamp: "2023-11-16T22:13:20.000Z",
        price: 120,
        averagePrice: 110,
      },
    ]);
    await provider.getPriceHistory(4151, "24h");
    expect(calls).toBe(1);
  });

  it("rejects suspiciously incomplete bulk snapshots", async () => {
    const provider = new JagexGrandExchangeProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: async () =>
          Response.json({
            "%JAGEX_TIMESTAMP%": 1_700_000_000,
            "1": { id: 1, name: "Only item", price: 1 },
          }),
      }),
      bulkEndpoint: "https://example.test/rs_dump.json",
    });
    await expect(provider.fetchSnapshot()).rejects.toMatchObject({
      code: "SUSPICIOUS_PRICE_SNAPSHOT",
    });
  });
});
