import type { PriceProvider, ProviderRequestOptions } from "@gielinor/core";
import { NotImplementedError } from "@gielinor/core";
import {
  GrandExchangeItemSchema,
  type GrandExchangeItem,
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

const JagexItemResponseSchema = z
  .object({
    item: z
      .object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        current: z.object({
          price: z.union([z.number().nonnegative(), z.string().min(1)]),
        }),
      })
      .passthrough(),
  })
  .passthrough();

export type JagexGrandExchangeOptions = {
  httpClient: ResilientHttpClient;
  cacheStore?: CacheStore;
  cachePolicy?: CachePolicy;
  endpoint?: string;
  now?: () => number;
};

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
  return Math.round(amount * multiplier);
}

export class JagexGrandExchangeProvider implements PriceProvider {
  private readonly cache: StaleWhileRevalidateCache;
  private readonly cachePolicy: CachePolicy;
  private readonly endpoint: string;

  public constructor(private readonly options: JagexGrandExchangeOptions) {
    this.cache = new StaleWhileRevalidateCache(
      options.cacheStore ?? new MemoryCacheStore(),
      options.now,
    );
    this.cachePolicy = options.cachePolicy ?? {
      freshForMs: 5 * 60_000,
      staleForMs: 60 * 60_000,
    };
    this.endpoint =
      options.endpoint ?? "https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json";
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

        return GrandExchangeItemSchema.parse({
          itemId,
          name: external.data.item.name,
          currentPrice: parseCompactPrice(external.data.item.current.price),
          timestamp: new Date().toISOString(),
          sourceName: "Jagex Grand Exchange ItemDB",
        });
      },
      requestOptions.forceRefresh ?? false,
    );

    return GrandExchangeItemSchema.parse({
      ...result.value,
      cacheStatus: result.status,
      cacheStoredAt: new Date(result.storedAt).toISOString(),
    });
  }

  public async getPriceHistory(_itemId: number, _range: PriceHistoryRange): Promise<PricePoint[]> {
    void _itemId;
    void _range;
    throw new NotImplementedError("Grand Exchange price history");
  }
}
