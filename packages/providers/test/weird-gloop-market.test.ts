import { describe, expect, it } from "vitest";

import { MemoryCacheStore } from "../src/cache.js";
import { ResilientHttpClient } from "../src/http.js";
import {
  WeirdGloopExchangeHistoryProvider,
  parseWeirdGloopHistory,
} from "../src/weird-gloop-exchange.js";
import { WeirdGloopRuneScapeNewsProvider, parseWeirdGloopNews } from "../src/weird-gloop-news.js";

describe("Weird Gloop RS3 exchange history", () => {
  it("parses the current object response with published volume", () => {
    expect(
      parseWeirdGloopHistory(
        {
          "4151": [
            { id: 4151, price: 70_000, volume: 1_200, timestamp: "2026-07-31T00:00:00Z" },
            { id: 4151, price: 72_000, volume: 1_300, timestamp: "2026-08-01T00:00:00Z" },
          ],
        },
        4151,
      ),
    ).toEqual([
      { timestamp: "2026-07-31T00:00:00.000Z", price: 70_000, volume: 1_200 },
      { timestamp: "2026-08-01T00:00:00.000Z", price: 72_000, volume: 1_300 },
    ]);
  });

  it("accepts documented legacy tuples but rejects unusable data", () => {
    expect(
      parseWeirdGloopHistory({ "4151": [[4151, 70_000, 1_200, 1_754_006_400]] }, 4151),
    ).toEqual([{ timestamp: "2025-08-01T00:00:00.000Z", price: 70_000, volume: 1_200 }]);
    expect(() => parseWeirdGloopHistory({ "4151": [{ id: 2 }] }, 4151)).toThrow(
      /no usable RS3 exchange history/,
    );
  });

  it("filters ranges, reports provenance, caches, and supports retained offline data", async () => {
    let calls = 0;
    const provider = new WeirdGloopExchangeHistoryProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: async () => {
          calls += 1;
          return Response.json({
            "4151": [
              { id: 4151, price: 60_000, volume: 900, timestamp: "2026-01-01T00:00:00Z" },
              { id: 4151, price: 70_000, volume: 1_200, timestamp: "2026-07-31T00:00:00Z" },
              { id: 4151, price: 72_000, volume: 1_300, timestamp: "2026-08-01T00:00:00Z" },
            ],
          });
        },
      }),
      cacheStore: new MemoryCacheStore(),
      endpoint: "https://example.test/exchange/history/rs/",
      now: () => Date.parse("2026-08-02T00:00:00Z"),
    });

    const history = await provider.getHistory(4151, "7d");
    expect(history.points).toHaveLength(2);
    expect(history.sourceName).toContain("Weird Gloop");
    expect(await provider.getLatest(4151, { offline: true })).toMatchObject({
      itemId: 4151,
      price: 72_000,
      volume: 1_300,
    });
    expect(calls).toBe(1);
  });
});

describe("RuneScape news provider", () => {
  it("preserves only source-provided tags and does not invent causal links", () => {
    const items = parseWeirdGloopNews(
      {
        items: [
          {
            id: "news-1",
            title: "A game update",
            url: "https://www.runescape.com/community/a-game-update",
            published_at: "2026-08-01T10:00:00Z",
            summary: "Published summary",
            tags: ["game-update", "boss"],
          },
        ],
      },
      "2026-08-02T00:00:00.000Z",
    );
    expect(items[0]).toMatchObject({
      id: "news-1",
      tags: ["game-update", "boss"],
      sourceName: "RuneScape news via Weird Gloop",
    });
  });

  it("rejects an empty or malformed live feed", async () => {
    const provider = new WeirdGloopRuneScapeNewsProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: async () => Response.json({ items: [{ title: "No URL" }] }),
      }),
      endpoint: "https://example.test/runescape/social",
    });
    await expect(provider.fetchNews()).rejects.toMatchObject({
      code: "MALFORMED_PROVIDER_RESPONSE",
    });
  });
});
