import type { MarketHistoryProvider, ProviderRequestOptions } from "@gielinor/core";
import {
  MarketHistorySeriesSchema,
  MarketPriceObservationSchema,
  type MarketHistorySeries,
  type MarketPriceObservation,
  type PriceHistoryRange,
} from "@gielinor/shared-types";
import { z } from "zod";

import {
  MemoryCacheStore,
  StaleWhileRevalidateCache,
  type CacheStatus,
  type CachePolicy,
  type CacheStore,
} from "./cache.js";
import { ProviderError, type ResilientHttpClient } from "./http.js";

const SOURCE_NAME = "Weird Gloop RuneScape exchange history";
const DEFAULT_ENDPOINT = "https://api.weirdgloop.org/exchange/history/rs/";
const RANGE_MILLISECONDS: Record<PriceHistoryRange, number> = {
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
  "90d": 90 * 24 * 60 * 60_000,
  "180d": 180 * 24 * 60 * 60_000,
};

export type WeirdGloopExchangeHistoryOptions = {
  httpClient: ResilientHttpClient;
  cacheStore?: CacheStore;
  cachePolicy?: CachePolicy;
  endpoint?: string;
  now?: () => number;
};

type NormalisedPoint = { timestamp: string; price: number; volume?: number };

function safeInteger(value: unknown): number | undefined {
  const parsed = z.coerce
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function timestamp(value: unknown): string | undefined {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const numeric = Number(value);
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function pointFromObject(
  value: Record<string, unknown>,
  expectedItemId: number,
): NormalisedPoint | null {
  const itemId = safeInteger(value.id ?? value.itemId ?? value.item_id);
  const price = safeInteger(value.price ?? value.value);
  const observedAt = timestamp(value.timestamp ?? value.time ?? value.date);
  const volume = safeInteger(value.volume);
  if (
    (itemId !== undefined && itemId !== expectedItemId) ||
    price === undefined ||
    observedAt === undefined
  ) {
    return null;
  }
  return { timestamp: observedAt, price, ...(volume === undefined ? {} : { volume }) };
}

function pointFromTuple(value: unknown[], expectedItemId: number): NormalisedPoint | null {
  let rawPrice: unknown;
  let rawVolume: unknown;
  let rawTimestamp: unknown;
  if (value.length >= 4 && safeInteger(value[0]) === expectedItemId) {
    [, rawPrice, rawVolume, rawTimestamp] = value;
  } else if (timestamp(value[0]) !== undefined) {
    [rawTimestamp, rawPrice, rawVolume] = value;
  } else {
    [rawPrice, rawVolume, rawTimestamp] = value;
  }
  const price = safeInteger(rawPrice);
  const volume = safeInteger(rawVolume);
  const observedAt = timestamp(rawTimestamp);
  if (price === undefined || observedAt === undefined) {
    return null;
  }
  return { timestamp: observedAt, price, ...(volume === undefined ? {} : { volume }) };
}

function candidateRows(payload: unknown, itemId: number): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const direct = record[String(itemId)];
  if (Array.isArray(direct)) {
    return direct;
  }
  for (const key of ["data", "items", "results", "history"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested;
    }
    if (typeof nested === "object" && nested !== null) {
      const itemRows = (nested as Record<string, unknown>)[String(itemId)];
      if (Array.isArray(itemRows)) {
        return itemRows;
      }
    }
  }
  return [];
}

export function parseWeirdGloopHistory(payload: unknown, itemId: number): NormalisedPoint[] {
  const parsed = candidateRows(payload, itemId)
    .map((value) =>
      Array.isArray(value)
        ? pointFromTuple(value, itemId)
        : typeof value === "object" && value !== null
          ? pointFromObject(value as Record<string, unknown>, itemId)
          : null,
    )
    .filter((value): value is NormalisedPoint => value !== null)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const unique = new Map(parsed.map((entry) => [entry.timestamp, entry]));
  if (unique.size === 0) {
    throw new ProviderError(
      "Weird Gloop returned no usable RS3 exchange history",
      "PRICE_HISTORY_UNAVAILABLE",
      false,
      { gielinorCode: "GC-DATA-002" },
    );
  }
  return [...unique.values()];
}

export class WeirdGloopExchangeHistoryProvider implements MarketHistoryProvider {
  private readonly cache: StaleWhileRevalidateCache;
  private readonly cachePolicy: CachePolicy;
  private readonly endpoint: string;
  private readonly now: () => number;

  public constructor(private readonly options: WeirdGloopExchangeHistoryOptions) {
    this.now = options.now ?? Date.now;
    this.cache = new StaleWhileRevalidateCache(
      options.cacheStore ?? new MemoryCacheStore(),
      this.now,
    );
    this.cachePolicy = options.cachePolicy ?? {
      freshForMs: 6 * 60 * 60_000,
      staleForMs: 7 * 24 * 60 * 60_000,
    };
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  }

  private validateItemId(itemId: number): void {
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      throw new ProviderError("Item ID must be a positive integer", "INVALID_ITEM_ID", false);
    }
  }

  private async loadHistory(
    itemId: number,
    options: ProviderRequestOptions,
  ): Promise<{ points: NormalisedPoint[]; status: CacheStatus }> {
    const loaded = await this.cache.load<NormalisedPoint[]>(
      `weird-gloop:history:${itemId}`,
      this.cachePolicy,
      async () => {
        const url = new URL("all", this.endpoint.replace(/\/?$/, "/"));
        url.searchParams.set("id", String(itemId));
        const response = await this.options.httpClient.get(url);
        return parseWeirdGloopHistory(await response.json(), itemId);
      },
      options.forceRefresh ?? false,
      options.offline ?? false,
      {
        provider: SOURCE_NAME,
        scope: "public-grand-exchange-history",
        validate: (value) =>
          z
            .array(
              z
                .object({
                  timestamp: z.string().datetime(),
                  price: z.number().int().nonnegative(),
                  volume: z.number().int().nonnegative().optional(),
                })
                .strict(),
            )
            .min(1)
            .parse(value)
            .map((point) => ({
              timestamp: point.timestamp,
              price: point.price,
              ...(point.volume === undefined ? {} : { volume: point.volume }),
            })),
      },
    );
    return { points: loaded.value, status: loaded.status };
  }

  public async getLatest(
    itemId: number,
    options: ProviderRequestOptions = {},
  ): Promise<MarketPriceObservation> {
    this.validateItemId(itemId);
    const loaded = await this.loadHistory(itemId, options);
    const points = loaded.points;
    const latest = points.at(-1);
    if (latest === undefined) {
      throw new ProviderError(
        "Weird Gloop latest price is unavailable",
        "PRICE_HISTORY_UNAVAILABLE",
        false,
      );
    }
    return MarketPriceObservationSchema.parse({
      itemId,
      ...latest,
      retrievedAt: new Date(this.now()).toISOString(),
      sourceName: SOURCE_NAME,
      sourceUrl: new URL(`all?id=${itemId}`, this.endpoint.replace(/\/?$/, "/")).toString(),
      dataState: loaded.status === "miss" ? "live-public-data" : "retained-cached-data",
      cacheStatus: loaded.status,
    });
  }

  public async getHistory(
    itemId: number,
    range: PriceHistoryRange,
    options: ProviderRequestOptions = {},
  ): Promise<MarketHistorySeries> {
    this.validateItemId(itemId);
    const loaded = await this.loadHistory(itemId, options);
    const points = loaded.points;
    const latest = Date.parse(points.at(-1)?.timestamp ?? "");
    const cutoff = latest - RANGE_MILLISECONDS[range];
    const filtered = points.filter((point) => Date.parse(point.timestamp) >= cutoff);
    return MarketHistorySeriesSchema.parse({
      itemId,
      points: filtered,
      retrievedAt: new Date(this.now()).toISOString(),
      sourceName: SOURCE_NAME,
      sourceUrl: new URL(`all?id=${itemId}`, this.endpoint.replace(/\/?$/, "/")).toString(),
      dataState: loaded.status === "miss" ? "live-public-data" : "retained-cached-data",
      cacheStatus: loaded.status,
    });
  }
}
