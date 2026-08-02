import {
  DEFAULT_MARKET_PREFERENCES,
  MarketHistorySeriesSchema,
  PriceCatalogueItemSchema,
  type GeTradeRecord,
  type MarketHistorySeries,
  type PlayerHoldingsSnapshot,
  type PriceCatalogueItem,
} from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import {
  MarketIntelligenceService,
  backtestMarketSeries,
  calculateMarketIndicators,
  scoreMarketIndicators,
} from "../src/market-intelligence-service.js";
import type { MarketHistoryProvider, PriceRepository } from "../src/ports.js";
import type { PlayerPrivateDataService } from "../src/player-private-data-service.js";

const NOW = Date.parse("2026-08-02T00:00:00.000Z");

function history(prices: number[], volumes = true): MarketHistorySeries {
  const start = NOW - prices.length * 86_400_000;
  return MarketHistorySeriesSchema.parse({
    itemId: 1,
    points: prices.map((price, index) => ({
      timestamp: new Date(start + index * 86_400_000).toISOString(),
      price,
      ...(volumes ? { volume: 10_000 + index } : {}),
    })),
    retrievedAt: new Date(NOW).toISOString(),
    sourceName: "fixture Weird Gloop",
    sourceUrl: "https://example.test/history?id=1",
  });
}

function item(
  currentPrice: number,
  timestamp = new Date(NOW - 3_600_000).toISOString(),
): PriceCatalogueItem {
  return PriceCatalogueItemSchema.parse({
    itemId: 1,
    name: "Test item",
    aliases: [],
    currentPrice,
    previousPrice: currentPrice - 1,
    buyLimit: 100,
    timestamp,
    retrievedAt: timestamp,
    sourceName: "fixture catalogue",
    sourceUrl: "https://example.test/catalogue",
    contentHash: "a".repeat(64),
  });
}

function services(options: {
  catalogue: PriceCatalogueItem;
  series: MarketHistorySeries;
  holdings?: PlayerHoldingsSnapshot | null;
  trades?: GeTradeRecord[];
  preferenceOverrides?: Partial<typeof DEFAULT_MARKET_PREFERENCES>;
}) {
  const prices = { getByIdOrAlias: async () => options.catalogue } as unknown as PriceRepository;
  const marketHistory = {
    getHistory: async () => options.series,
  } as unknown as MarketHistoryProvider;
  const privateData = {
    getHoldings: async () => options.holdings ?? null,
    getMarketPreferences: async () => ({
      ...DEFAULT_MARKET_PREFERENCES,
      ...options.preferenceOverrides,
    }),
    listTrades: async () => options.trades ?? [],
  } as unknown as PlayerPrivateDataService;
  return new MarketIntelligenceService(prices, marketHistory, privateData, () => NOW);
}

describe("market indicators and deterministic scoring", () => {
  it("produces finite, reproducible component scores with missing volume", () => {
    const series = history(
      Array.from({ length: 90 }, (_, index) => 1_000 + index * 3),
      false,
    );
    const indicators = calculateMarketIndicators(item(1_270), series);
    const first = scoreMarketIndicators(indicators, DEFAULT_MARKET_PREFERENCES, NOW);
    const second = scoreMarketIndicators(indicators, DEFAULT_MARKET_PREFERENCES, NOW);
    expect(first).toEqual(second);
    expect(first.liquidity.reasons[0]).toContain("No public volume");
    expect(JSON.stringify(first)).not.toMatch(/NaN|Infinity/);
  });

  it("downgrades stale evidence and materially disagreeing providers", () => {
    const series = history(Array.from({ length: 90 }, () => 1_000));
    series.points[series.points.length - 1] = {
      ...series.points.at(-1)!,
      timestamp: new Date(NOW - 10 * 86_400_000).toISOString(),
    };
    const indicators = calculateMarketIndicators(item(2_000), series);
    const scores = scoreMarketIndicators(indicators, DEFAULT_MARKET_PREFERENCES, NOW);
    expect(scores.freshness.score).toBe(0);
    expect(scores.sourceConfidence.score).toBeLessThan(10);
  });
});

describe("market recommendations and sizing", () => {
  it("never emits a sell recommendation for an unheld item", async () => {
    const prices = [
      ...Array.from({ length: 170 }, () => 1_000),
      ...Array.from({ length: 10 }, (_, index) => 3_000 - index * 100),
    ];
    const result = await services({
      catalogue: item(2_100),
      series: history(prices),
    }).analyseGeItem("profile-1", 1);
    expect(["sell-candidate", "reduce"]).not.toContain(result.recommendation);
    expect(result.heldQuantity).toBe(0);
  });

  it("uses confirmed holdings and acquisition cost for a sell candidate", async () => {
    const prices = [
      ...Array.from({ length: 170 }, () => 1_000),
      ...Array.from({ length: 10 }, (_, index) => 3_000 - index * 100),
    ];
    const holdings = {
      schemaVersion: 1 as const,
      snapshotId: "00000000-0000-4000-8000-000000000001",
      profileId: "profile-1",
      capturedAt: new Date(NOW).toISOString(),
      source: "manual" as const,
      cashGp: 1_000_000,
      items: [{ itemId: 1, quantity: 50, averageAcquisitionPrice: 800 }],
    };
    const result = await services({
      catalogue: item(2_100),
      series: history(prices),
      holdings,
    }).analyseGeItem("profile-1", 1);
    expect(result.recommendation).toBe("sell-candidate");
    expect(result.averageAcquisitionPrice).toBe(800);
  });

  it("caps manual sizing by cash allocation, risk tolerance, and buy limit", async () => {
    const holdings = {
      schemaVersion: 1 as const,
      snapshotId: "00000000-0000-4000-8000-000000000001",
      profileId: "profile-1",
      capturedAt: new Date(NOW).toISOString(),
      source: "manual" as const,
      cashGp: 2_000_000,
      items: [],
    };
    const service = services({
      catalogue: item(1_000),
      series: history(Array.from({ length: 180 }, (_, index) => 700 + index * 2)),
      holdings,
      preferenceOverrides: { maximumAllocationPercent: 10, riskTolerance: "medium" },
    });
    const plan = await service.createManualOrderPlan("profile-1", 1);
    expect(plan.maximumSuggestedQuantity).toBe(100);
    expect(plan.estimatedGpAllocation).toBe(100_000);
    expect(plan.execution).toBe("manual-only");
  });
});

describe("portfolio and backtesting", () => {
  it("labels unrealised guide value and calculates local cost basis", async () => {
    const holdings = {
      schemaVersion: 1 as const,
      snapshotId: "00000000-0000-4000-8000-000000000001",
      profileId: "profile-1",
      capturedAt: new Date(NOW).toISOString(),
      source: "manual" as const,
      items: [{ itemId: 1, quantity: 10, averageAcquisitionPrice: 800 }],
    };
    const summary = await services({
      catalogue: item(1_000),
      series: history(Array(90).fill(1_000)),
      holdings,
    }).getPortfolioSummary("profile-1");
    expect(summary).toMatchObject({
      guideValue: 10_000,
      knownCostBasis: 8_000,
      unrealisedGuideValueGainLoss: 2_000,
    });
    expect(summary.warnings[0]).toContain("estimated");
  });

  it("is reproducible and enforces delayed fills and chronological evaluation", () => {
    const series = history(
      Array.from({ length: 180 }, (_, index) => 1_000 + Math.floor(index / 5) * 10),
    );
    const input = {
      initialGp: 1_000_000,
      slippagePercent: 1,
      fillDelayDays: 2,
      maximumHoldingDays: 7,
      trainingFraction: 0.7,
    };
    const first = backtestMarketSeries(series, input);
    const second = backtestMarketSeries(series, input);
    expect(first).toEqual(second);
    expect(first.trainingPointCount + first.evaluationPointCount).toBe(180);
    expect(first.protections.join(" ")).toMatch(/only observations at or before/);
    expect(first.assumptions.fillDelayDays).toBe(2);
  });
});
