import { createHash } from "node:crypto";

import type { GrandExchangeDataProvider, ProviderRequestOptions } from "@gielinor/core";
import {
  GrandExchangeItemSchema,
  PriceCatalogueItemSchema,
  PriceDataSnapshotSchema,
  PricePointSchema,
  type GrandExchangeItem,
  type PriceCatalogueItem,
  type PriceDataSnapshot,
  type PriceHistoryRange,
  type PricePoint,
} from "@gielinor/shared-types";
import { z } from "zod";

import {
  MemoryCacheStore,
  StaleWhileRevalidateCache,
  type CachePolicy,
  type CacheStore,
} from "./cache.js";
import { ProviderError, type ResilientHttpClient } from "./http.js";

const safeNonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const JagexItemResponseSchema = z
  .object({
    item: z
      .object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        description: z.string().min(1).optional(),
        members: z.enum(["true", "false"]).optional(),
        current: z.object({
          price: z.union([z.number().nonnegative(), z.string().min(1)]),
        }),
      })
      .passthrough(),
  })
  .passthrough();

const BulkItemSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    name_pt: z.string().trim().min(1).nullable().optional(),
    examine: z.string().trim().min(1).nullable().optional(),
    members: z.boolean().optional(),
    price: safeNonNegativeInteger.nullable().optional(),
    last: safeNonNegativeInteger.nullable().optional(),
    volume: safeNonNegativeInteger.nullable().optional(),
    limit: safeNonNegativeInteger.nullable().optional(),
    highalch: safeNonNegativeInteger.nullable().optional(),
    lowalch: safeNonNegativeInteger.nullable().optional(),
    value: safeNonNegativeInteger.nullable().optional(),
  })
  .passthrough();

const GraphResponseSchema = z
  .object({
    daily: z.record(z.string(), safeNonNegativeInteger),
    average: z.record(z.string(), safeNonNegativeInteger),
  })
  .passthrough();

const HISTORY_RANGE_MS: Record<PriceHistoryRange, number> = {
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
  "90d": 90 * 24 * 60 * 60_000,
  "180d": 180 * 24 * 60 * 60_000,
};

const BULK_SOURCE_NAME = "RuneScape Wiki Grand Exchange Market Watch bulk dump";
const BULK_SOURCE_URL = "https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json";

export type JagexGrandExchangeOptions = {
  httpClient: ResilientHttpClient;
  cacheStore?: CacheStore;
  cachePolicy?: CachePolicy;
  historyCachePolicy?: CachePolicy;
  endpoint?: string;
  graphEndpoint?: string;
  bulkEndpoint?: string;
  now?: () => number;
};

function optionalNumber(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

function contentHash(item: Omit<PriceCatalogueItem, "contentHash">): string {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

function unixSecondsToIso(value: unknown, field: string): string {
  const parsed = z.number().positive().finite().safeParse(value);
  if (!parsed.success) {
    throw new ProviderError(
      `Grand Exchange bulk data has an invalid ${field}`,
      "MALFORMED_PROVIDER_RESPONSE",
      false,
    );
  }
  const date = new Date(parsed.data * 1_000);
  if (Number.isNaN(date.valueOf())) {
    throw new ProviderError(
      `Grand Exchange bulk data has an invalid ${field}`,
      "MALFORMED_PROVIDER_RESPONSE",
      false,
    );
  }
  return date.toISOString();
}

export function parseCompactPrice(value: number | string): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProviderError(
        "Jagex ItemDB returned an invalid price",
        "MALFORMED_PROVIDER_RESPONSE",
        false,
      );
    }
    return value;
  }

  const normalized = value.trim().toLocaleLowerCase("en-GB").replaceAll(",", "");
  const match = /^(\d+(?:\.\d+)?)\s*([kmb])?$/.exec(normalized);
  if (match === null) {
    throw new ProviderError(
      "Jagex ItemDB returned an unsupported price format",
      "MALFORMED_PROVIDER_RESPONSE",
      false,
    );
  }

  const amount = Number(match[1]);
  const multiplier =
    match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  const price = Math.round(amount * multiplier);
  if (!Number.isSafeInteger(price)) {
    throw new ProviderError(
      "Jagex ItemDB price exceeded the safe numeric range",
      "MALFORMED_PROVIDER_RESPONSE",
      false,
    );
  }
  return price;
}

export class JagexGrandExchangeProvider implements GrandExchangeDataProvider {
  private readonly cache: StaleWhileRevalidateCache;
  private readonly cachePolicy: CachePolicy;
  private readonly historyCachePolicy: CachePolicy;
  private readonly endpoint: string;
  private readonly graphEndpoint: string;
  private readonly bulkEndpoint: string;
  private readonly now: () => number;

  public constructor(private readonly options: JagexGrandExchangeOptions) {
    this.now = options.now ?? Date.now;
    this.cache = new StaleWhileRevalidateCache(
      options.cacheStore ?? new MemoryCacheStore(),
      this.now,
    );
    this.cachePolicy = options.cachePolicy ?? {
      freshForMs: 5 * 60_000,
      staleForMs: 60 * 60_000,
    };
    this.historyCachePolicy = options.historyCachePolicy ?? {
      freshForMs: 6 * 60 * 60_000,
      staleForMs: 7 * 24 * 60 * 60_000,
    };
    this.endpoint =
      options.endpoint ?? "https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json";
    this.graphEndpoint =
      options.graphEndpoint ?? "https://secure.runescape.com/m=itemdb_rs/api/graph/";
    this.bulkEndpoint = options.bulkEndpoint ?? BULK_SOURCE_URL;
  }

  public async getCurrentPrice(
    itemId: number,
    requestOptions: ProviderRequestOptions = {},
  ): Promise<GrandExchangeItem> {
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      throw new ProviderError("Item ID must be a positive integer", "INVALID_ITEM_ID", false);
    }

    const result = await this.cache.load<GrandExchangeItem>(
      `ge:item:${itemId}`,
      this.cachePolicy,
      async () => {
        const url = new URL(this.endpoint);
        url.searchParams.set("item", String(itemId));
        const response = await this.options.httpClient.get(url);
        const external = JagexItemResponseSchema.safeParse(await response.json());
        if (!external.success || external.data.item.id !== itemId) {
          throw new ProviderError(
            "Jagex ItemDB returned a malformed item response",
            "MALFORMED_PROVIDER_RESPONSE",
            false,
          );
        }
        const retrievedAt = new Date(this.now()).toISOString();

        return GrandExchangeItemSchema.parse({
          itemId,
          name: external.data.item.name,
          ...(external.data.item.description === undefined
            ? {}
            : { description: external.data.item.description }),
          ...(external.data.item.members === undefined
            ? {}
            : { members: external.data.item.members === "true" }),
          currentPrice: parseCompactPrice(external.data.item.current.price),
          timestamp: retrievedAt,
          retrievedAt,
          sourceName: "Jagex Grand Exchange ItemDB",
          sourceUrl: url.toString(),
        });
      },
      requestOptions.forceRefresh ?? false,
      requestOptions.offline ?? false,
      {
        provider: "Jagex Grand Exchange ItemDB",
        scope: "public-grand-exchange",
        validate: (value) => GrandExchangeItemSchema.parse(value),
      },
    );

    return GrandExchangeItemSchema.parse({
      ...result.value,
      cacheStatus: result.status,
      cacheStoredAt: new Date(result.storedAt).toISOString(),
      cacheAgeSeconds: Math.floor(result.metadata.ageMs / 1_000),
      cacheFreshUntil: new Date(result.metadata.freshUntil).toISOString(),
      cacheStaleUntil: new Date(result.metadata.staleUntil).toISOString(),
      lastSuccessfulRefreshAt: new Date(result.metadata.lastSuccessfulRefreshAt).toISOString(),
      ...(result.metadata.lastFailedRefreshAt === undefined
        ? {}
        : {
            lastFailedRefreshAt: new Date(result.metadata.lastFailedRefreshAt).toISOString(),
          }),
      ...(result.metadata.lastFailureCode === undefined
        ? {}
        : { lastRefreshErrorCode: result.metadata.lastFailureCode }),
      ...(result.staleReason === undefined ? {} : { staleReason: result.staleReason }),
    });
  }

  public async fetchSnapshot(): Promise<PriceDataSnapshot> {
    const response = await this.options.httpClient.get(new URL(this.bulkEndpoint));
    const raw: unknown = await response.json();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ProviderError(
        "Grand Exchange bulk data was not an object",
        "MALFORMED_PROVIDER_RESPONSE",
        false,
      );
    }
    const record = raw as Record<string, unknown>;
    const sourceRevisionValue = z
      .number()
      .positive()
      .finite()
      .safeParse(record["%JAGEX_TIMESTAMP%"]);
    if (!sourceRevisionValue.success) {
      throw new ProviderError(
        "Grand Exchange bulk data has no valid Jagex timestamp",
        "MALFORMED_PROVIDER_RESPONSE",
        false,
      );
    }
    const sourceUpdatedAt = unixSecondsToIso(record["%JAGEX_TIMESTAMP%"], "Jagex update timestamp");
    const retrievedAt = new Date(this.now()).toISOString();
    const items: PriceCatalogueItem[] = [];
    const ids = new Set<number>();

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith("%")) {
        continue;
      }
      const parsed = BulkItemSchema.safeParse(value);
      if (!parsed.success || String(parsed.data.id) !== key) {
        throw new ProviderError(
          `Grand Exchange bulk data contains a malformed item at key ${key}`,
          "MALFORMED_PROVIDER_RESPONSE",
          false,
          parsed.success ? undefined : { cause: parsed.error },
        );
      }
      if (ids.has(parsed.data.id)) {
        throw new ProviderError(
          `Grand Exchange bulk data contains duplicate item ID ${parsed.data.id}`,
          "MALFORMED_PROVIDER_RESPONSE",
          false,
        );
      }
      ids.add(parsed.data.id);
      const aliases =
        parsed.data.name_pt === null ||
        parsed.data.name_pt === undefined ||
        parsed.data.name_pt.localeCompare(parsed.data.name, undefined, {
          sensitivity: "accent",
        }) === 0
          ? []
          : [parsed.data.name_pt];
      const itemWithoutHash = {
        itemId: parsed.data.id,
        name: parsed.data.name,
        aliases,
        ...(parsed.data.examine === null || parsed.data.examine === undefined
          ? {}
          : { description: parsed.data.examine }),
        ...(parsed.data.members === undefined ? {} : { members: parsed.data.members }),
        ...(optionalNumber(parsed.data.price) === undefined
          ? {}
          : { currentPrice: optionalNumber(parsed.data.price) }),
        ...(optionalNumber(parsed.data.last) === undefined
          ? {}
          : { previousPrice: optionalNumber(parsed.data.last) }),
        ...(optionalNumber(parsed.data.limit) === undefined
          ? {}
          : { buyLimit: optionalNumber(parsed.data.limit) }),
        ...(optionalNumber(parsed.data.highalch) === undefined
          ? {}
          : { alchemyValue: optionalNumber(parsed.data.highalch) }),
        ...(optionalNumber(parsed.data.lowalch) === undefined
          ? {}
          : { lowAlchemyValue: optionalNumber(parsed.data.lowalch) }),
        ...(optionalNumber(parsed.data.value) === undefined
          ? {}
          : { storeValue: optionalNumber(parsed.data.value) }),
        ...(optionalNumber(parsed.data.volume) === undefined
          ? {}
          : { volume: optionalNumber(parsed.data.volume) }),
        timestamp: sourceUpdatedAt,
        sourceName: BULK_SOURCE_NAME,
        sourceUrl: this.bulkEndpoint,
        retrievedAt,
      } satisfies Omit<PriceCatalogueItem, "contentHash">;
      items.push(
        PriceCatalogueItemSchema.parse({
          ...itemWithoutHash,
          contentHash: contentHash(itemWithoutHash),
        }),
      );
    }

    if (items.length < 1_000) {
      throw new ProviderError(
        `Grand Exchange bulk data was suspiciously incomplete (${items.length} items)`,
        "SUSPICIOUS_PRICE_SNAPSHOT",
        false,
      );
    }

    return PriceDataSnapshotSchema.parse({
      provider: BULK_SOURCE_NAME,
      sourceRevision: String(sourceRevisionValue.data),
      sourceUpdatedAt,
      retrievedAt,
      items: items.sort((left, right) => left.itemId - right.itemId),
    });
  }

  public async getPriceHistory(
    itemId: number,
    range: PriceHistoryRange,
    requestOptions: ProviderRequestOptions = {},
  ): Promise<PricePoint[]> {
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      throw new ProviderError("Item ID must be a positive integer", "INVALID_ITEM_ID", false);
    }
    const fullHistory = await this.cache.load<PricePoint[]>(
      `ge:history:${itemId}`,
      this.historyCachePolicy,
      async () => {
        const url = new URL(`${this.graphEndpoint.replace(/\/?$/, "/")}${itemId}.json`);
        const response = await this.options.httpClient.get(url);
        const parsed = GraphResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          throw new ProviderError(
            "Jagex ItemDB returned malformed price history",
            "MALFORMED_PROVIDER_RESPONSE",
            false,
            { cause: parsed.error },
          );
        }
        const points: PricePoint[] = [];
        for (const [timestampText, price] of Object.entries(parsed.data.daily)) {
          const timestampMilliseconds = Number(timestampText);
          if (
            !Number.isSafeInteger(timestampMilliseconds) ||
            timestampMilliseconds <= 0 ||
            price === 0
          ) {
            continue;
          }
          const averagePrice = parsed.data.average[timestampText];
          points.push(
            PricePointSchema.parse({
              timestamp: new Date(timestampMilliseconds).toISOString(),
              price,
              ...(averagePrice === undefined || averagePrice === 0 ? {} : { averagePrice }),
            }),
          );
        }
        points.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
        if (points.length === 0) {
          throw new ProviderError(
            "Jagex ItemDB returned no usable price history",
            "PRICE_HISTORY_UNAVAILABLE",
            false,
          );
        }
        return points;
      },
      requestOptions.forceRefresh ?? false,
      requestOptions.offline ?? false,
      {
        provider: "Jagex Grand Exchange ItemDB graph",
        scope: "public-grand-exchange",
        validate: (value) => z.array(PricePointSchema).parse(value),
      },
    );

    const latestTimestamp = Date.parse(fullHistory.value.at(-1)?.timestamp ?? "");
    const cutoff = latestTimestamp - HISTORY_RANGE_MS[range];
    return fullHistory.value.filter((point) => Date.parse(point.timestamp) >= cutoff);
  }
}
