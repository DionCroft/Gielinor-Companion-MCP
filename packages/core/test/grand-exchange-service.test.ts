import {
  PriceCatalogueItemSchema,
  PriceDataSnapshotSchema,
  PriceDataStatusSchema,
  StoredPriceHistorySchema,
  type GrandExchangeItem,
  type PriceCatalogueItem,
  type PriceDataSnapshot,
  type PricePoint,
  type PriceSyncResult,
  type StoredPriceHistory,
} from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { CompanionError } from "../src/errors.js";
import { GrandExchangeService } from "../src/grand-exchange-service.js";
import type { GrandExchangeDataProvider, PriceRepository } from "../src/ports.js";
import type { LevellingPlannerService } from "../src/levelling-planner-service.js";
import type { QuestService } from "../src/quest-service.js";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const HASH = "a".repeat(64);

function item(
  itemId: number,
  name: string,
  options: { price?: number; timestamp?: string; volume?: number } = {},
): PriceCatalogueItem {
  return PriceCatalogueItemSchema.parse({
    itemId,
    name,
    aliases: itemId === 1 ? ["First alias"] : [],
    ...(options.price === undefined ? {} : { currentPrice: options.price }),
    buyLimit: 100,
    alchemyValue: 60,
    lowAlchemyValue: 40,
    ...(options.volume === undefined ? {} : { volume: options.volume }),
    timestamp: options.timestamp ?? "2026-07-23T00:00:00.000Z",
    sourceName: "fixture catalogue",
    sourceUrl: "https://example.test/catalogue",
    retrievedAt: "2026-07-23T01:00:00.000Z",
    contentHash: HASH,
  });
}

function historyPoints(prices: number[]): PricePoint[] {
  return prices.map((price, index) => ({
    timestamp: new Date(Date.parse("2026-07-01T00:00:00.000Z") + index * 86_400_000).toISOString(),
    price,
    averagePrice: price,
  }));
}

class MemoryPriceRepository implements PriceRepository {
  public readonly items = new Map<number, PriceCatalogueItem>([
    [1, item(1, "First item", { price: 100, volume: 50 })],
    [2, item(2, "Missing price")],
  ]);
  public readonly histories = new Map<number, StoredPriceHistory>();

  public async getByIdOrAlias(identifier: number | string): Promise<PriceCatalogueItem | null> {
    if (typeof identifier === "number") {
      return this.items.get(identifier) ?? null;
    }
    const key = identifier.toLocaleLowerCase();
    return (
      [...this.items.values()].find(
        (candidate) =>
          candidate.name.toLocaleLowerCase() === key ||
          candidate.aliases.some((alias) => alias.toLocaleLowerCase() === key),
      ) ?? null
    );
  }

  public async search(query: string, limit: number): Promise<PriceCatalogueItem[]> {
    const key = query.toLocaleLowerCase();
    return [...this.items.values()]
      .filter(
        (candidate) =>
          candidate.name.toLocaleLowerCase().includes(key) ||
          candidate.aliases.some((alias) => alias.toLocaleLowerCase().includes(key)),
      )
      .slice(0, limit);
  }

  public async replaceSnapshot(snapshot: PriceDataSnapshot): Promise<PriceSyncResult> {
    for (const catalogueItem of snapshot.items) {
      this.items.set(catalogueItem.itemId, catalogueItem);
    }
    return {
      provider: snapshot.provider,
      sourceRevision: snapshot.sourceRevision,
      checkedAt: snapshot.retrievedAt,
      total: snapshot.items.length,
      inserted: snapshot.items.length,
      updated: 0,
      unchanged: 0,
      removed: 0,
    };
  }

  public async getDataStatus() {
    return PriceDataStatusSchema.parse({
      state: "ready",
      provider: "fixture",
      sourceRevision: "1",
      sourceUpdatedAt: "2026-07-23T00:00:00.000Z",
      lastAttemptAt: "2026-07-23T01:00:00.000Z",
      lastSuccessfulSyncAt: "2026-07-23T01:00:00.000Z",
      itemCount: this.items.size,
      historyItemCount: this.histories.size,
      historyPointCount: [...this.histories.values()].reduce(
        (total, stored) => total + stored.points.length,
        0,
      ),
    });
  }

  public async recordSyncFailure(): Promise<void> {}

  public async getPriceHistory(itemId: number): Promise<StoredPriceHistory | null> {
    return this.histories.get(itemId) ?? null;
  }

  public async replacePriceHistory(
    itemId: number,
    points: PricePoint[],
    retrievedAt: string,
    sourceName: string,
  ): Promise<StoredPriceHistory> {
    const stored = StoredPriceHistorySchema.parse({ itemId, points, retrievedAt, sourceName });
    this.histories.set(itemId, stored);
    return stored;
  }
}

class FixtureProvider implements GrandExchangeDataProvider {
  public historyCalls = 0;
  public historyError: Error | undefined;
  public points = historyPoints([100, 102, 104, 106, 108, 110, 112, 114, 116, 500]);

  public async getCurrentPrice(): Promise<GrandExchangeItem> {
    return { itemId: 1, name: "First item", currentPrice: 100, sourceName: "fixture" };
  }

  public async getPriceHistory(): Promise<PricePoint[]> {
    this.historyCalls += 1;
    if (this.historyError !== undefined) {
      throw this.historyError;
    }
    return this.points;
  }

  public async fetchSnapshot(): Promise<PriceDataSnapshot> {
    return PriceDataSnapshotSchema.parse({
      provider: "fixture",
      sourceRevision: "2",
      sourceUpdatedAt: "2026-07-23T00:00:00.000Z",
      retrievedAt: "2026-07-23T12:00:00.000Z",
      items: [item(1, "First item", { price: 101 })],
    });
  }
}

describe("GrandExchangeService", () => {
  it("searches aliases and exposes unavailable instant high/low prices honestly", async () => {
    const service = new GrandExchangeService(
      new MemoryPriceRepository(),
      new FixtureProvider(),
      undefined,
      undefined,
      () => NOW,
    );
    expect(await service.search("alias")).toHaveLength(1);
    await expect(service.getItemDetails("First alias")).resolves.toMatchObject({
      itemId: 1,
      currentPrice: 100,
      priceFreshness: { state: "fresh" },
      unavailableFields: ["instant buy/high price", "instant sell/low price"],
    });
  });

  it("calculates ordered chart data, changes, averages, volatility, and outliers", async () => {
    const service = new GrandExchangeService(
      new MemoryPriceRepository(),
      new FixtureProvider(),
      undefined,
      undefined,
      () => NOW,
    );
    const summary = await service.getPriceSummary(1, "30d");
    expect(summary.chart.map((point) => point.price)).toEqual([
      100, 102, 104, 106, 108, 110, 112, 114, 116, 500,
    ]);
    expect(summary.percentageChange).toBe(400);
    expect(summary.movingAverages.days7).toBeCloseTo(166.57, 2);
    expect(summary.volatilityPercent).toBeGreaterThan(0);
    expect(summary.outliers).toEqual([expect.objectContaining({ price: 500, direction: "high" })]);
    expect(summary.historicalHigh).toBe(500);
    expect(summary.historicalLow).toBe(100);
  });

  it("uses fresh stored history and safely falls back to retained stale history", async () => {
    const repository = new MemoryPriceRepository();
    const provider = new FixtureProvider();
    repository.histories.set(
      1,
      StoredPriceHistorySchema.parse({
        itemId: 1,
        points: historyPoints([100, 110]),
        retrievedAt: new Date(NOW - 60_000).toISOString(),
        sourceName: "stored",
      }),
    );
    const service = new GrandExchangeService(repository, provider, undefined, undefined, () => NOW);
    expect((await service.getPriceSummary(1)).cacheStatus).toBe("fresh");
    expect(provider.historyCalls).toBe(0);

    repository.histories.set(
      1,
      StoredPriceHistorySchema.parse({
        itemId: 1,
        points: historyPoints([100, 110]),
        retrievedAt: new Date(NOW - 2 * 86_400_000).toISOString(),
        sourceName: "stored",
      }),
    );
    provider.historyError = new CompanionError("upstream unavailable", "PROVIDER_UNAVAILABLE");
    const stale = await service.getPriceSummary(1);
    expect(stale.cacheStatus).toBe("stale");
    expect(stale.warnings.join(" ")).toMatch(/retained validated history/);
  });

  it("aggregates duplicate items, preserves missing prices, and protects overflow", async () => {
    const service = new GrandExchangeService(
      new MemoryPriceRepository(),
      new FixtureProvider(),
      undefined,
      undefined,
      () => NOW,
    );
    const valuation = await service.valueItemList([
      { item: 1, quantity: 2 },
      { item: "First item", quantity: 3 },
      { item: 2, quantity: 1 },
      { item: "Unknown", quantity: 4 },
    ]);
    expect(valuation).toMatchObject({
      totalValue: 500,
      pricedItemCount: 1,
      unpricedItemCount: 2,
      complete: false,
    });
    expect(valuation.items.find((line) => line.itemId === 1)?.quantity).toBe(5);
    await expect(
      service.valueItemList([{ item: 1, quantity: Number.MAX_SAFE_INTEGER }]),
    ).rejects.toMatchObject({ code: "VALUE_OVERFLOW" });
  });

  it("values quest lists and keeps user-supplied training materials separate", async () => {
    const quests = {
      createShoppingList: async () => ({
        targetQuestId: "target",
        routeQuestIds: ["target"],
        items: [
          {
            itemId: 1,
            name: "First item",
            quantity: 2,
            alternatives: [],
            requiredByQuestIds: ["target"],
          },
        ],
      }),
    } as unknown as QuestService;
    const planner = {
      createPlan: async () => ({
        skillId: "mining",
        targetLevel: 10,
        totalGpRange: { minimum: 1_000, maximum: 2_000 },
      }),
    } as unknown as LevellingPlannerService;
    const service = new GrandExchangeService(
      new MemoryPriceRepository(),
      new FixtureProvider(),
      quests,
      planner,
      () => NOW,
    );
    expect(await service.calculateQuestShoppingCost("profile", "target")).toMatchObject({
      valuation: { totalValue: 200, complete: true },
    });
    expect(
      await service.calculateTrainingCost(
        { profileId: "profile", skillId: "mining", targetLevel: 10 },
        [{ item: 1, quantity: 5 }],
      ),
    ).toMatchObject({
      plan: { totalGpRange: { minimum: 1_000, maximum: 2_000 } },
      materialValuation: { totalValue: 500 },
    });
  });

  it("exports chart-ready JSON and CSV without writing arbitrary files", async () => {
    const service = new GrandExchangeService(
      new MemoryPriceRepository(),
      new FixtureProvider(),
      undefined,
      undefined,
      () => NOW,
    );
    const json = await service.exportPriceData({
      items: [1],
      range: "30d",
      format: "json",
    });
    expect(json.mediaType).toBe("application/json");
    expect(JSON.parse(json.content)).toMatchObject({ schemaVersion: 1 });
    const csv = await service.exportPriceData({
      items: [1],
      range: "30d",
      format: "csv",
    });
    expect(csv.content).toContain('"itemId","name","timestamp","price"');
    expect(csv.pointCount).toBe(10);
  });
});
