import { createHash } from "node:crypto";

import type { ProviderRequestOptions, RuneScapeNewsProvider } from "@gielinor/core";
import {
  RuneScapeNewsSnapshotSchema,
  type RuneScapeNewsItem,
  type RuneScapeNewsSnapshot,
} from "@gielinor/shared-types";
import { z } from "zod";

import {
  MemoryCacheStore,
  StaleWhileRevalidateCache,
  type CachePolicy,
  type CacheStore,
} from "./cache.js";
import { ProviderError, type ResilientHttpClient } from "./http.js";

const SOURCE_NAME = "RuneScape news via Weird Gloop";
const DEFAULT_ENDPOINT = "https://api.weirdgloop.org/runescape/social";

export type WeirdGloopNewsOptions = {
  httpClient: ResilientHttpClient;
  cacheStore?: CacheStore;
  cachePolicy?: CachePolicy;
  endpoint?: string;
  now?: () => number;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function dateTime(value: unknown): string | undefined {
  if (typeof value === "number") {
    const date = new Date(value < 10_000_000_000 ? value * 1_000 : value);
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
  }
  const valueText = text(value);
  if (valueText === undefined) {
    return undefined;
  }
  const date = new Date(valueText);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function rows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const record = payload as Record<string, unknown>;
  for (const key of ["data", "items", "results", "social", "news"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
}

export function parseWeirdGloopNews(payload: unknown, retrievedAt: string): RuneScapeNewsItem[] {
  const items: RuneScapeNewsItem[] = [];
  for (const raw of rows(payload)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    const title = text(record.title ?? record.name);
    const url = text(record.url ?? record.link);
    const publishedAt = dateTime(
      record.publishedAt ?? record.published_at ?? record.date ?? record.timestamp,
    );
    if (
      title === undefined ||
      url === undefined ||
      publishedAt === undefined ||
      !z.string().url().safeParse(url).success
    ) {
      continue;
    }
    const rawTags = Array.isArray(record.tags)
      ? record.tags
      : Array.isArray(record.categories)
        ? record.categories
        : [];
    const tags = [
      ...new Set(rawTags.map(text).filter((value): value is string => value !== undefined)),
    ].slice(0, 50);
    const summary = text(record.summary ?? record.description ?? record.excerpt);
    const imageUrl = text(record.imageUrl ?? record.image_url ?? record.image);
    const validImageUrl =
      imageUrl !== undefined && z.string().url().safeParse(imageUrl).success ? imageUrl : undefined;
    items.push({
      id:
        text(record.id ?? record.guid) ??
        createHash("sha256").update(`${url}\0${publishedAt}`).digest("hex"),
      title,
      url,
      publishedAt,
      ...(summary === undefined ? {} : { summary }),
      ...(validImageUrl === undefined ? {} : { imageUrl: validImageUrl }),
      sourceName: SOURCE_NAME,
      retrievedAt,
      tags,
    });
  }
  return RuneScapeNewsSnapshotSchema.shape.items.parse(
    items.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)),
  );
}

export class WeirdGloopRuneScapeNewsProvider implements RuneScapeNewsProvider {
  private readonly cache: StaleWhileRevalidateCache;
  private readonly cachePolicy: CachePolicy;
  private readonly endpoint: string;
  private readonly now: () => number;

  public constructor(private readonly options: WeirdGloopNewsOptions) {
    this.now = options.now ?? Date.now;
    this.cache = new StaleWhileRevalidateCache(
      options.cacheStore ?? new MemoryCacheStore(),
      this.now,
    );
    this.cachePolicy = options.cachePolicy ?? {
      freshForMs: 30 * 60_000,
      staleForMs: 24 * 60 * 60_000,
    };
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  }

  public async fetchNews(options: ProviderRequestOptions = {}): Promise<RuneScapeNewsSnapshot> {
    const result = await this.cache.load<RuneScapeNewsSnapshot>(
      "weird-gloop:runescape-news",
      this.cachePolicy,
      async () => {
        const retrievedAt = new Date(this.now()).toISOString();
        const response = await this.options.httpClient.get(new URL(this.endpoint));
        const items = parseWeirdGloopNews(await response.json(), retrievedAt);
        if (items.length === 0) {
          throw new ProviderError(
            "RuneScape news provider returned no usable entries",
            "MALFORMED_PROVIDER_RESPONSE",
            false,
          );
        }
        return RuneScapeNewsSnapshotSchema.parse({
          items,
          retrievedAt,
          sourceName: SOURCE_NAME,
          sourceUrl: this.endpoint,
        });
      },
      options.forceRefresh ?? false,
      options.offline ?? false,
      {
        provider: SOURCE_NAME,
        scope: "public-runescape-news",
        validate: (value) => RuneScapeNewsSnapshotSchema.parse(value),
      },
    );
    return result.value;
  }
}
