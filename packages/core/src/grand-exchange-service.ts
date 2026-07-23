import {
  ItemListValuationSchema,
  ItemPriceSummarySchema,
  PriceDataSnapshotSchema,
  PriceDataStatusSchema,
  PriceFreshnessSchema,
  PriceHistoryRangeSchema,
  PriceSyncResultSchema,
  type ItemListValuation,
  type ItemPriceSummary,
  type PriceCatalogueItem,
  type PriceFreshness,
  type PriceHistoryRange,
  type PricePoint,
  type PriceSyncResult,
  type StoredPriceHistory,
  type ValuationLine,
} from "@gielinor/shared-types";

import { CompanionError, NotFoundError } from "./errors.js";
import type {
  GrandExchangeDataProvider,
  PriceRepository,
  ProviderRequestOptions,
} from "./ports.js";
import type { LevellingPlanInput, LevellingPlannerService } from "./levelling-planner-service.js";
import type { QuestService } from "./quest-service.js";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const HISTORY_FRESH_MS = 6 * HOUR_MS;
const HISTORY_STALE_MS = 7 * DAY_MS;
const CATALOGUE_FRESH_MS = 36 * HOUR_MS;

const RANGE_MS: Record<PriceHistoryRange, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
  "180d": 180 * DAY_MS,
};

export type ItemReference = number | string;

export type ValuationRequestLine = {
  item: ItemReference;
  quantity: number;
};

export type EquipmentValuationRequestLine = ValuationRequestLine & {
  slot: string;
};

export type ExportPriceDataInput = {
  items: ItemReference[];
  range: PriceHistoryRange;
  format: "json" | "csv";
  forceRefresh?: boolean | undefined;
};

type HistoryLoad = {
  stored: StoredPriceHistory;
  cacheStatus: "miss" | "fresh" | "stale";
  warnings: string[];
};

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function freshness(timestamp: string | undefined, freshForMs: number, now: number): PriceFreshness {
  if (timestamp === undefined) {
    return PriceFreshnessSchema.parse({ state: "unknown" });
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return PriceFreshnessSchema.parse({ state: "unknown" });
  }
  const ageSeconds = Math.max(0, Math.floor((now - parsed) / 1_000));
  return PriceFreshnessSchema.parse({
    state: now - parsed <= freshForMs ? "fresh" : "stale",
    timestamp,
    ageSeconds,
  });
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CompanionError(
      "Grand Exchange valuation exceeds JavaScript's safe integer range",
      "VALUE_OVERFLOW",
    );
  }
  return result;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CompanionError(
      "Grand Exchange valuation exceeds JavaScript's safe integer range",
      "VALUE_OVERFLOW",
    );
  }
  return result;
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function movingAverage(points: PricePoint[], days: number): number | undefined {
  const values = points.slice(-days).map((point) => point.price);
  const value = mean(values);
  return value === undefined ? undefined : round(value);
}

function volatility(points: PricePoint[]): number | undefined {
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.price ?? 0;
    const current = points[index]?.price ?? 0;
    if (previous > 0) {
      returns.push((current - previous) / previous);
    }
  }
  const average = mean(returns);
  if (average === undefined) {
    return undefined;
  }
  const variance =
    returns.reduce((total, value) => total + (value - average) ** 2, 0) / returns.length;
  return round(Math.sqrt(variance) * 100, 4);
}

function outliers(points: PricePoint[]): ItemPriceSummary["outliers"] {
  const average = mean(points.map((point) => point.price));
  if (average === undefined || points.length < 5) {
    return [];
  }
  const variance =
    points.reduce((total, point) => total + (point.price - average) ** 2, 0) / points.length;
  const standardDeviation = Math.sqrt(variance);
  if (standardDeviation === 0) {
    return [];
  }
  return points
    .map((point) => ({
      timestamp: point.timestamp,
      price: point.price,
      zScore: round((point.price - average) / standardDeviation, 4),
    }))
    .filter((point) => Math.abs(point.zScore) >= 2.5)
    .map((point) => ({
      ...point,
      direction: point.zScore > 0 ? ("high" as const) : ("low" as const),
    }));
}

function filterRange(points: PricePoint[], range: PriceHistoryRange): PricePoint[] {
  const latest = Date.parse(points.at(-1)?.timestamp ?? "");
  if (Number.isNaN(latest)) {
    return [];
  }
  const cutoff = latest - RANGE_MS[range];
  return points.filter((point) => Date.parse(point.timestamp) >= cutoff);
}

function csvCell(value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export class GrandExchangeService {
  public constructor(
    private readonly repository: PriceRepository,
    private readonly provider: GrandExchangeDataProvider,
    private readonly quests?: QuestService,
    private readonly planner?: LevellingPlannerService,
    private readonly now: () => number = Date.now,
  ) {}

  private async item(identifier: ItemReference): Promise<PriceCatalogueItem> {
    const item = await this.repository.getByIdOrAlias(identifier);
    if (item === null) {
      throw new NotFoundError(`Grand Exchange item ${String(identifier)}`);
    }
    return item;
  }

  private async loadHistory(
    itemId: number,
    options: ProviderRequestOptions = {},
  ): Promise<HistoryLoad> {
    const existing = await this.repository.getPriceHistory(itemId);
    const age =
      existing === null ? Number.POSITIVE_INFINITY : this.now() - Date.parse(existing.retrievedAt);
    if (!(options.forceRefresh ?? false) && existing !== null && age <= HISTORY_FRESH_MS) {
      return { stored: existing, cacheStatus: "fresh", warnings: [] };
    }

    try {
      const points = await this.provider.getPriceHistory(itemId, "180d", options);
      const stored = await this.repository.replacePriceHistory(
        itemId,
        points,
        new Date(this.now()).toISOString(),
        "Jagex Grand Exchange ItemDB graph",
      );
      return { stored, cacheStatus: "miss", warnings: [] };
    } catch (error) {
      if (existing !== null && age <= HISTORY_STALE_MS) {
        return {
          stored: existing,
          cacheStatus: "stale",
          warnings: [
            "The history provider could not be refreshed; retained validated history is being used.",
          ],
        };
      }
      throw error;
    }
  }

  public async search(query: string, limit = 20): Promise<PriceCatalogueItem[]> {
    return this.repository.search(query, limit);
  }

  public async getItemDetails(identifier: ItemReference) {
    const item = await this.item(identifier);
    const unavailableFields: string[] = [];
    if (item.highPrice === undefined) {
      unavailableFields.push("instant buy/high price");
    }
    if (item.lowPrice === undefined) {
      unavailableFields.push("instant sell/low price");
    }
    if (item.volume === undefined) {
      unavailableFields.push("daily trading volume");
    }
    return {
      ...item,
      priceFreshness: freshness(item.timestamp, CATALOGUE_FRESH_MS, this.now()),
      unavailableFields,
      disclaimer:
        "Prices are historical guide values, not guaranteed transaction prices or profit claims.",
    };
  }

  public async getPriceHistory(
    identifier: ItemReference,
    range: PriceHistoryRange,
    forceRefresh = false,
  ) {
    const item = await this.item(identifier);
    const validatedRange = PriceHistoryRangeSchema.parse(range);
    const history = await this.loadHistory(item.itemId, { forceRefresh });
    return {
      itemId: item.itemId,
      name: item.name,
      range: validatedRange,
      points: filterRange(history.stored.points, validatedRange),
      cacheStatus: history.cacheStatus,
      retrievedAt: history.stored.retrievedAt,
      sourceName: history.stored.sourceName,
      warnings: history.warnings,
      chartReady: true,
    };
  }

  public async getPriceSummary(
    identifier: ItemReference,
    range: PriceHistoryRange = "30d",
    forceRefresh = false,
  ): Promise<ItemPriceSummary> {
    const item = await this.item(identifier);
    const history = await this.loadHistory(item.itemId, { forceRefresh });
    const points = filterRange(history.stored.points, PriceHistoryRangeSchema.parse(range));
    const prices = points.map((point) => point.price);
    const first = points[0]?.price;
    const latest = points.at(-1)?.price;
    const warnings = [...history.warnings];
    if (item.currentPrice === undefined) {
      warnings.push("The current guide price is unavailable.");
    }
    if (points.length < 2) {
      warnings.push("Too few historical points are available for change and volatility analysis.");
    }
    const unavailableFields = [
      "instant buy/high price",
      "instant sell/low price",
      "historical per-day volume",
    ];
    if (item.volume === undefined) {
      unavailableFields.push("latest daily volume");
    }

    return ItemPriceSummarySchema.parse({
      itemId: item.itemId,
      name: item.name,
      range,
      ...(item.currentPrice === undefined ? {} : { currentPrice: item.currentPrice }),
      ...(first === undefined ? {} : { firstHistoricalPrice: first }),
      ...(latest === undefined ? {} : { latestHistoricalPrice: latest }),
      ...(prices.length === 0 ? {} : { historicalHigh: Math.max(...prices) }),
      ...(prices.length === 0 ? {} : { historicalLow: Math.min(...prices) }),
      ...(first === undefined || latest === undefined || first === 0
        ? {}
        : { percentageChange: round(((latest - first) / first) * 100, 4) }),
      movingAverages: {
        ...(movingAverage(points, 7) === undefined ? {} : { days7: movingAverage(points, 7) }),
        ...(movingAverage(points, 30) === undefined ? {} : { days30: movingAverage(points, 30) }),
        ...(movingAverage(points, 90) === undefined ? {} : { days90: movingAverage(points, 90) }),
      },
      ...(volatility(points) === undefined ? {} : { volatilityPercent: volatility(points) }),
      outliers: outliers(points),
      priceFreshness: freshness(item.timestamp, CATALOGUE_FRESH_MS, this.now()),
      historyFreshness: freshness(history.stored.retrievedAt, HISTORY_FRESH_MS, this.now()),
      cacheStatus: history.cacheStatus,
      chart: points,
      unavailableFields,
      warnings,
    });
  }

  public async comparePrices(
    identifiers: ItemReference[],
    range: PriceHistoryRange = "30d",
  ): Promise<ItemPriceSummary[]> {
    if (identifiers.length < 1 || identifiers.length > 20) {
      throw new CompanionError("Compare from 1 to 20 items", "INVALID_ITEM_COUNT");
    }
    return Promise.all(
      identifiers.map((identifier) => this.getPriceSummary(identifier, range, false)),
    );
  }

  public async valueItemList(lines: ValuationRequestLine[]): Promise<ItemListValuation> {
    if (lines.length < 1 || lines.length > 500) {
      throw new CompanionError("Value from 1 to 500 item lines", "INVALID_ITEM_COUNT");
    }
    const aggregated = new Map<
      string,
      {
        item?: PriceCatalogueItem | undefined;
        requestedName?: string | undefined;
        quantity: number;
      }
    >();
    for (const line of lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
        throw new CompanionError(
          "Item quantities must be positive safe integers",
          "INVALID_QUANTITY",
        );
      }
      let resolved: PriceCatalogueItem | undefined;
      try {
        resolved = (await this.repository.getByIdOrAlias(line.item)) ?? undefined;
      } catch (error) {
        if (!(error instanceof CompanionError) || error.code !== "AMBIGUOUS_ITEM_ALIAS") {
          throw error;
        }
      }
      const key =
        resolved === undefined
          ? `missing:${String(line.item).toLocaleLowerCase()}`
          : `item:${resolved.itemId}`;
      const existing = aggregated.get(key);
      if (existing === undefined) {
        aggregated.set(key, {
          ...(resolved === undefined ? {} : { item: resolved }),
          ...(typeof line.item === "string" ? { requestedName: line.item } : {}),
          quantity: line.quantity,
        });
      } else {
        existing.quantity = safeAdd(existing.quantity, line.quantity);
      }
    }

    const valued: ValuationLine[] = [];
    let totalValue = 0;
    let pricedItemCount = 0;
    let unpricedItemCount = 0;
    for (const line of aggregated.values()) {
      if (line.item === undefined) {
        unpricedItemCount += 1;
        valued.push({
          ...(line.requestedName === undefined ? {} : { requestedName: line.requestedName }),
          name: line.requestedName ?? "Unknown item",
          quantity: line.quantity,
          freshness: freshness(undefined, CATALOGUE_FRESH_MS, this.now()),
          missingReason: "No unambiguous catalogue item matched this identifier.",
        });
        continue;
      }
      if (line.item.currentPrice === undefined) {
        unpricedItemCount += 1;
        valued.push({
          itemId: line.item.itemId,
          ...(line.requestedName === undefined ? {} : { requestedName: line.requestedName }),
          name: line.item.name,
          quantity: line.quantity,
          ...(line.item.timestamp === undefined ? {} : { priceTimestamp: line.item.timestamp }),
          freshness: freshness(line.item.timestamp, CATALOGUE_FRESH_MS, this.now()),
          missingReason: "The source does not publish a current guide price for this item.",
        });
        continue;
      }
      const totalPrice = safeMultiply(line.item.currentPrice, line.quantity);
      totalValue = safeAdd(totalValue, totalPrice);
      pricedItemCount += 1;
      valued.push({
        itemId: line.item.itemId,
        ...(line.requestedName === undefined ? {} : { requestedName: line.requestedName }),
        name: line.item.name,
        quantity: line.quantity,
        unitPrice: line.item.currentPrice,
        totalPrice,
        priceTimestamp: line.item.timestamp,
        freshness: freshness(line.item.timestamp, CATALOGUE_FRESH_MS, this.now()),
      });
    }
    const warnings = [
      "Guide-price valuation is informational and does not guarantee a transaction price.",
    ];
    if (unpricedItemCount > 0) {
      warnings.push(`${unpricedItemCount} aggregated item line(s) could not be priced.`);
    }
    if (valued.some((line) => line.freshness.state === "stale")) {
      warnings.push("At least one valuation uses stale guide-price data.");
    }
    return ItemListValuationSchema.parse({
      items: valued,
      totalValue,
      pricedItemCount,
      unpricedItemCount,
      complete: unpricedItemCount === 0,
      valuedAt: new Date(this.now()).toISOString(),
      warnings,
    });
  }

  public async valueEquipmentSetup(lines: EquipmentValuationRequestLine[]) {
    const valuation = await this.valueItemList(lines);
    return {
      slots: lines.map((line) => ({
        slot: line.slot,
        item: line.item,
        quantity: line.quantity,
      })),
      valuation,
    };
  }

  public async calculateQuestShoppingCost(profileId: string, quest: string) {
    if (this.quests === undefined) {
      throw new CompanionError("Quest companion is not configured", "UNSUPPORTED_FEATURE");
    }
    const shoppingList = await this.quests.createShoppingList(profileId, quest);
    const valuation = await this.valueItemList(
      shoppingList.items.map((item) => ({
        item: item.itemId ?? item.name,
        quantity: item.quantity,
      })),
    );
    return { shoppingList, valuation };
  }

  public async calculateTrainingCost(
    input: LevellingPlanInput,
    materials: ValuationRequestLine[] = [],
  ) {
    if (this.planner === undefined) {
      throw new CompanionError("Levelling planner is not configured", "UNSUPPORTED_FEATURE");
    }
    const plan = await this.planner.createPlan(input);
    const materialValuation =
      materials.length === 0 ? undefined : await this.valueItemList(materials);
    return {
      plan,
      ...(materialValuation === undefined ? {} : { materialValuation }),
      recalculationBasis:
        materials.length === 0
          ? "The plan's published GP range; no consumable quantities were supplied for live repricing."
          : "The user-supplied consumable quantities valued at current guide prices. This is shown separately to avoid double-counting the plan estimate.",
      warnings: [
        "Training rates, material usage, and guide prices are estimates; no outcome or profit is guaranteed.",
      ],
    };
  }

  public async exportPriceData(input: ExportPriceDataInput) {
    if (input.items.length < 1 || input.items.length > 20) {
      throw new CompanionError("Export from 1 to 20 items", "INVALID_ITEM_COUNT");
    }
    const summaries = await Promise.all(
      input.items.map((item) =>
        this.getPriceSummary(item, input.range, input.forceRefresh ?? false),
      ),
    );
    const date = new Date(this.now()).toISOString().slice(0, 10);
    if (input.format === "json") {
      return {
        format: "json" as const,
        mediaType: "application/json",
        filename: `gielinor-price-data-${date}.json`,
        content: JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt: new Date(this.now()).toISOString(),
            disclaimer: "Guide prices are not guaranteed transaction prices.",
            items: summaries,
          },
          null,
          2,
        ),
        itemCount: summaries.length,
        pointCount: summaries.reduce((total, summary) => total + summary.chart.length, 0),
      };
    }
    const rows = [
      ["itemId", "name", "timestamp", "price", "averagePrice", "range"].map(csvCell).join(","),
    ];
    for (const summary of summaries) {
      for (const point of summary.chart) {
        rows.push(
          [
            summary.itemId,
            summary.name,
            point.timestamp,
            point.price,
            point.averagePrice,
            summary.range,
          ]
            .map(csvCell)
            .join(","),
        );
      }
    }
    return {
      format: "csv" as const,
      mediaType: "text/csv",
      filename: `gielinor-price-data-${date}.csv`,
      content: `${rows.join("\r\n")}\r\n`,
      itemCount: summaries.length,
      pointCount: rows.length - 1,
    };
  }

  public async refreshData(itemIds: number[] = []) {
    if (itemIds.length > 20 || itemIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new CompanionError(
        "Refresh history for no more than 20 positive item IDs",
        "INVALID_ITEM_COUNT",
      );
    }
    const attemptedAt = new Date(this.now()).toISOString();
    let catalogue: PriceSyncResult;
    try {
      const snapshot = PriceDataSnapshotSchema.parse(await this.provider.fetchSnapshot());
      catalogue = PriceSyncResultSchema.parse(await this.repository.replaceSnapshot(snapshot));
    } catch (error) {
      const code = error instanceof CompanionError ? error.code : "PRICE_SYNC_FAILED";
      const message =
        error instanceof CompanionError
          ? error.message
          : "Grand Exchange data refresh could not be completed";
      await this.repository.recordSyncFailure(code, message, attemptedAt);
      throw error instanceof CompanionError ? error : new CompanionError(message, code);
    }
    const histories = [];
    for (const itemId of [...new Set(itemIds)]) {
      await this.item(itemId);
      const history = await this.loadHistory(itemId, { forceRefresh: true });
      histories.push({
        itemId,
        pointCount: history.stored.points.length,
        retrievedAt: history.stored.retrievedAt,
        cacheStatus: history.cacheStatus,
      });
    }
    return { catalogue, histories };
  }

  public async getDataStatus() {
    const status = PriceDataStatusSchema.parse(await this.repository.getDataStatus());
    return {
      ...status,
      catalogueFreshness: freshness(status.sourceUpdatedAt, CATALOGUE_FRESH_MS, this.now()),
      disclaimer:
        "RS3 public sources publish guide prices and daily history, not an instant order book.",
    };
  }
}
