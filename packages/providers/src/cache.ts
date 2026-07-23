export type CacheStatus = "miss" | "fresh" | "stale";

export type CacheEntry<T> = {
  value: T;
  storedAt: number;
  freshUntil: number;
  staleUntil: number;
};

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
}

export type CachePolicy = {
  freshForMs: number;
  staleForMs: number;
};

export type CachedLoadResult<T> = {
  value: T;
  status: CacheStatus;
  storedAt: number;
};

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  public async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return (this.entries.get(key) as CacheEntry<T> | undefined) ?? null;
  }

  public async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.entries.set(key, entry);
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
  ): Promise<CachedLoadResult<T>> {
    const cached = await this.store.get<T>(key);
    const now = this.now();

    if (!forceRefresh && cached !== null && cached.freshUntil > now) {
      return { value: cached.value, status: "fresh", storedAt: cached.storedAt };
    }

    if (!forceRefresh && cached !== null && cached.staleUntil > now) {
      void this.refresh(key, policy, loader).catch(() => undefined);
      return { value: cached.value, status: "stale", storedAt: cached.storedAt };
    }

    try {
      const entry = await this.refresh(key, policy, loader);
      return { value: entry.value, status: "miss", storedAt: entry.storedAt };
    } catch (error) {
      if (cached !== null && cached.staleUntil > now) {
        return { value: cached.value, status: "stale", storedAt: cached.storedAt };
      }
      throw error;
    }
  }

  private async refresh<T>(
    key: string,
    policy: CachePolicy,
    loader: () => Promise<T>,
  ): Promise<CacheEntry<T>> {
    const existing = this.refreshes.get(key);
    if (existing !== undefined) {
      return existing as Promise<CacheEntry<T>>;
    }

    const refresh = (async () => {
      const value = await loader();
      const storedAt = this.now();
      const entry: CacheEntry<T> = {
        value,
        storedAt,
        freshUntil: storedAt + policy.freshForMs,
        staleUntil: storedAt + policy.freshForMs + policy.staleForMs,
      };
      await this.store.set(key, entry);
      return entry;
    })();

    this.refreshes.set(key, refresh as Promise<CacheEntry<unknown>>);
    try {
      return await refresh;
    } finally {
      this.refreshes.delete(key);
    }
  }
}
