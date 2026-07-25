import {
  createTraceId,
  sanitisePublicDetails,
  toGielinorError,
  type GielinorError,
  type GielinorErrorCode,
} from "@gielinor/shared-types";

import { ProviderError } from "./http.js";

export type CacheStatus = "miss" | "fresh" | "stale";
export type CacheStaleReason =
  "stale-while-revalidate" | "provider-failure" | "expired-fallback" | "offline";

export type CacheEntry<T> = {
  metadataVersion: 1;
  value: T;
  provider: string;
  fetchedAt: number;
  storedAt: number;
  freshUntil: number;
  staleUntil: number;
  lastSuccessfulRefreshAt: number;
  lastFailedRefreshAt?: number;
  lastFailureCode?: GielinorErrorCode;
  lastFailureTraceId?: string;
};

export type CacheQuarantineRecord = {
  quarantineId: string;
  provider: string;
  quarantinedAt: number;
  storedAt: number;
  errorCode: "GC-CACHE-004" | "GC-CACHE-005";
  reason: string;
  sample?: Record<string, unknown>;
};

export type CacheRefreshFailure = {
  failedAt: number;
  code: GielinorErrorCode;
  traceId: string;
};

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  quarantine<T>(
    key: string,
    entry: CacheEntry<T>,
    record: CacheQuarantineRecord,
    removeActive?: boolean,
  ): Promise<void>;
  recordRefreshFailure(key: string, failure: CacheRefreshFailure): Promise<void>;
  listQuarantined(): Promise<CacheQuarantineRecord[]>;
  restoreQuarantined(quarantineId: string): Promise<boolean>;
  clearExpiredQuarantine(cutoffAt: number): Promise<number>;
}

export type CachePolicy = {
  freshForMs: number;
  staleForMs: number;
};

export type CacheMetadata = {
  provider: string;
  fetchedAt: number;
  storedAt: number;
  ageMs: number;
  freshUntil: number;
  staleUntil: number;
  lastSuccessfulRefreshAt: number;
  lastFailedRefreshAt?: number;
  lastFailureCode?: GielinorErrorCode;
  lastFailureTraceId?: string;
};

export type CachedLoadResult<T> = {
  value: T;
  status: CacheStatus;
  storedAt: number;
  metadata: CacheMetadata;
  staleReason?: CacheStaleReason;
  refreshError?: GielinorError;
  nextRetryAt?: number;
};

export type CacheLoadOptions<T> = {
  provider?: string;
  scope?: string;
  validate?: (value: unknown) => T;
  liveOnly?: boolean;
};

type InternalQuarantine = {
  key: string;
  entry: CacheEntry<unknown>;
  record: CacheQuarantineRecord;
};

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly quarantined = new Map<string, InternalQuarantine>();

  public async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return (this.entries.get(key) as CacheEntry<T> | undefined) ?? null;
  }

  public async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.entries.set(key, entry);
  }

  public async quarantine<T>(
    key: string,
    entry: CacheEntry<T>,
    record: CacheQuarantineRecord,
    removeActive = true,
  ): Promise<void> {
    this.quarantined.set(record.quarantineId, {
      key,
      entry: entry as CacheEntry<unknown>,
      record,
    });
    if (removeActive) {
      this.entries.delete(key);
    }
  }

  public async recordRefreshFailure(key: string, failure: CacheRefreshFailure): Promise<void> {
    const entry = this.entries.get(key);
    if (entry !== undefined) {
      entry.lastFailedRefreshAt = failure.failedAt;
      entry.lastFailureCode = failure.code;
      entry.lastFailureTraceId = failure.traceId;
    }
  }

  public async listQuarantined(): Promise<CacheQuarantineRecord[]> {
    return [...this.quarantined.values()]
      .map(({ record }) => structuredClone(record))
      .sort((left, right) => right.quarantinedAt - left.quarantinedAt);
  }

  public async restoreQuarantined(quarantineId: string): Promise<boolean> {
    const quarantined = this.quarantined.get(quarantineId);
    if (quarantined === undefined) {
      return false;
    }
    this.entries.set(quarantined.key, quarantined.entry);
    this.quarantined.delete(quarantineId);
    return true;
  }

  public async clearExpiredQuarantine(cutoffAt: number): Promise<number> {
    if (!Number.isSafeInteger(cutoffAt) || cutoffAt < 0) {
      throw new RangeError("Quarantine cutoff must be a non-negative integer timestamp");
    }
    let deleted = 0;
    for (const [quarantineId, { record }] of this.quarantined) {
      if (record.quarantinedAt < cutoffAt) {
        this.quarantined.delete(quarantineId);
        deleted += 1;
      }
    }
    return deleted;
  }
}

function publicMetadata<T>(entry: CacheEntry<T>, now: number): CacheMetadata {
  return {
    provider: entry.provider,
    fetchedAt: entry.fetchedAt,
    storedAt: entry.storedAt,
    ageMs: Math.max(0, now - entry.fetchedAt),
    freshUntil: entry.freshUntil,
    staleUntil: entry.staleUntil,
    lastSuccessfulRefreshAt: entry.lastSuccessfulRefreshAt,
    ...(entry.lastFailedRefreshAt === undefined
      ? {}
      : { lastFailedRefreshAt: entry.lastFailedRefreshAt }),
    ...(entry.lastFailureCode === undefined ? {} : { lastFailureCode: entry.lastFailureCode }),
    ...(entry.lastFailureTraceId === undefined
      ? {}
      : { lastFailureTraceId: entry.lastFailureTraceId }),
  };
}

function cacheResult<T>(
  entry: CacheEntry<T>,
  status: CacheStatus,
  now: number,
  extras: Pick<CachedLoadResult<T>, "staleReason" | "refreshError" | "nextRetryAt"> = {},
): CachedLoadResult<T> {
  return {
    value: entry.value,
    status,
    storedAt: entry.storedAt,
    metadata: publicMetadata(entry, now),
    ...(extras.staleReason === undefined ? {} : { staleReason: extras.staleReason }),
    ...(extras.refreshError === undefined ? {} : { refreshError: extras.refreshError }),
    ...(extras.nextRetryAt === undefined ? {} : { nextRetryAt: extras.nextRetryAt }),
  };
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateEntryMetadata<T>(entry: CacheEntry<T>): void {
  if (
    entry.metadataVersion !== 1 ||
    entry.provider.trim() === "" ||
    !validTimestamp(entry.fetchedAt) ||
    !validTimestamp(entry.storedAt) ||
    !validTimestamp(entry.freshUntil) ||
    !validTimestamp(entry.staleUntil) ||
    !validTimestamp(entry.lastSuccessfulRefreshAt) ||
    entry.fetchedAt > entry.storedAt ||
    entry.storedAt > entry.freshUntil ||
    entry.freshUntil > entry.staleUntil
  ) {
    throw new ProviderError(
      "Cached provider metadata failed integrity validation",
      "INVALID_STORED_DATA",
      false,
      { gielinorCode: "GC-CACHE-005" },
    );
  }
}

export class StaleWhileRevalidateCache {
  private readonly refreshes = new Map<string, Promise<CacheEntry<unknown>>>();

  public constructor(
    private readonly store: CacheStore,
    private readonly now: () => number = Date.now,
  ) {}

  public async load<T>(
    key: string,
    policy: CachePolicy,
    loader: () => Promise<T>,
    forceRefresh = false,
    offline = false,
    options: CacheLoadOptions<T> = {},
  ): Promise<CachedLoadResult<T>> {
    const scopedKey = `${options.scope ?? "public"}:${key}`;
    const provider = options.provider ?? "unspecified-provider";
    const now = this.now();
    let cached = await this.store.get<T>(scopedKey);
    if (cached !== null) {
      try {
        validateEntryMetadata(cached);
        cached = {
          ...cached,
          value: options.validate?.(cached.value) ?? cached.value,
        };
      } catch {
        await this.quarantine(
          scopedKey,
          cached,
          provider,
          "Cached data failed schema or integrity validation",
          "GC-CACHE-005",
        );
        cached = null;
      }
    }

    if (offline) {
      if (options.liveOnly === true || cached === null) {
        throw new ProviderError(
          options.liveOnly === true
            ? "This provider data is live-only and is unavailable offline"
            : "No retained provider data is available while offline",
          "OFFLINE_CACHE_MISS",
          false,
          { gielinorCode: "GC-CACHE-001" },
        );
      }
      return cacheResult(
        cached,
        cached.freshUntil > now ? "fresh" : "stale",
        now,
        cached.freshUntil > now ? {} : { staleReason: "offline" },
      );
    }

    if (!forceRefresh && cached !== null && cached.freshUntil > now) {
      return cacheResult(cached, "fresh", now);
    }

    if (!forceRefresh && cached !== null && cached.staleUntil > now) {
      void this.refresh(scopedKey, policy, loader, provider, options).catch(() => undefined);
      return cacheResult(cached, "stale", now, {
        staleReason: "stale-while-revalidate",
      });
    }

    try {
      const entry = await this.refresh(scopedKey, policy, loader, provider, options);
      return cacheResult(entry, "miss", now);
    } catch (error) {
      if (cached !== null) {
        const refreshError = toGielinorError(error, {
          fallbackCode: "GC-PROVIDER-001",
          source: "provider-cache",
          operation: "refresh",
        });
        const failedEntry: CacheEntry<T> = {
          ...cached,
          lastFailedRefreshAt: now,
          lastFailureCode: refreshError.code,
          lastFailureTraceId: refreshError.traceId,
        };
        return cacheResult(failedEntry, "stale", now, {
          staleReason: cached.staleUntil > now ? "provider-failure" : "expired-fallback",
          refreshError,
          nextRetryAt: now + (refreshError.retryAfterMs ?? 60_000),
        });
      }
      throw error;
    }
  }

  private async quarantine<T>(
    key: string,
    entry: CacheEntry<T>,
    provider: string,
    reason: string,
    errorCode: CacheQuarantineRecord["errorCode"],
    removeActive = true,
  ): Promise<void> {
    await this.store.quarantine(
      key,
      entry,
      {
        quarantineId: createTraceId(),
        provider,
        quarantinedAt: this.now(),
        storedAt: entry.storedAt,
        errorCode,
        reason,
        sample: sanitisePublicDetails({ value: entry.value }),
      },
      removeActive,
    );
  }

  private async refresh<T>(
    key: string,
    policy: CachePolicy,
    loader: () => Promise<T>,
    provider: string,
    options: CacheLoadOptions<T>,
  ): Promise<CacheEntry<T>> {
    const existing = this.refreshes.get(key);
    if (existing !== undefined) {
      return existing as Promise<CacheEntry<T>>;
    }

    const refresh = (async () => {
      try {
        const loadedValue = await loader();
        let value: T;
        try {
          value = options.validate?.(loadedValue) ?? loadedValue;
        } catch (error) {
          const storedAt = this.now();
          const invalidEntry: CacheEntry<T> = {
            metadataVersion: 1,
            value: loadedValue,
            provider,
            fetchedAt: storedAt,
            storedAt,
            freshUntil: storedAt,
            staleUntil: storedAt,
            lastSuccessfulRefreshAt: storedAt,
          };
          await this.quarantine(
            key,
            invalidEntry,
            provider,
            "Provider payload failed cache validation and was not activated",
            "GC-CACHE-004",
            false,
          );
          throw new ProviderError(
            "Provider payload failed validation and was quarantined",
            "INVALID_PROVIDER_RESULT",
            false,
            { cause: error, gielinorCode: "GC-PROVIDER-004" },
          );
        }
        const storedAt = this.now();
        const entry: CacheEntry<T> = {
          metadataVersion: 1,
          value,
          provider,
          fetchedAt: storedAt,
          storedAt,
          freshUntil: storedAt + policy.freshForMs,
          staleUntil: storedAt + policy.freshForMs + policy.staleForMs,
          lastSuccessfulRefreshAt: storedAt,
        };
        await this.store.set(key, entry);
        return entry;
      } catch (error) {
        const failure = toGielinorError(error, {
          fallbackCode: "GC-PROVIDER-001",
          source: "provider-cache",
          operation: "refresh",
        });
        await this.store.recordRefreshFailure(key, {
          failedAt: this.now(),
          code: failure.code,
          traceId: failure.traceId,
        });
        throw error;
      }
    })();

    this.refreshes.set(key, refresh as Promise<CacheEntry<unknown>>);
    try {
      return await refresh;
    } finally {
      this.refreshes.delete(key);
    }
  }
}
