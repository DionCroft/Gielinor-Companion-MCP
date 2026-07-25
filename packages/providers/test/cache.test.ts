import { describe, expect, it, vi } from "vitest";

import { MemoryCacheStore, StaleWhileRevalidateCache } from "../src/cache.js";
import { ProviderError } from "../src/http.js";

describe("StaleWhileRevalidateCache", () => {
  it("serves fresh then stale data while refreshing in the background", async () => {
    let now = 1_000;
    let value = 1;
    const loader = vi.fn(async () => value);
    const cache = new StaleWhileRevalidateCache(new MemoryCacheStore(), () => now);
    const policy = { freshForMs: 100, staleForMs: 500 };

    expect(await cache.load("key", policy, loader)).toMatchObject({
      value: 1,
      status: "miss",
    });
    expect(await cache.load("key", policy, loader)).toMatchObject({
      value: 1,
      status: "fresh",
    });

    now = 1_101;
    value = 2;
    expect(await cache.load("key", policy, loader)).toMatchObject({
      value: 1,
      status: "stale",
    });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(await cache.load("key", policy, loader)).toMatchObject({
      value: 2,
      status: "fresh",
    });
  });

  it("does not replace cached data when background refresh fails", async () => {
    let now = 1_000;
    const cache = new StaleWhileRevalidateCache(new MemoryCacheStore(), () => now);
    const policy = { freshForMs: 100, staleForMs: 500 };
    await cache.load("key", policy, async () => "valid");
    now = 1_101;

    const result = await cache.load("key", policy, async () => {
      throw new Error("malformed response");
    });
    expect(result).toMatchObject({ value: "valid", status: "stale" });
  });

  it("serves expired retained data offline without starting a refresh", async () => {
    let now = 1_000;
    const loader = vi.fn(async () => "retained");
    const cache = new StaleWhileRevalidateCache(new MemoryCacheStore(), () => now);
    const policy = { freshForMs: 100, staleForMs: 100 };
    await cache.load("offline", policy, loader);
    now = 10_000;

    expect(await cache.load("offline", policy, loader, false, true)).toMatchObject({
      value: "retained",
      status: "stale",
    });
    expect(loader).toHaveBeenCalledTimes(1);
    await expect(cache.load("missing", policy, loader, false, true)).rejects.toMatchObject({
      code: "OFFLINE_CACHE_MISS",
    });
  });

  it("shares the cache lock across concurrent misses and releases it after failure", async () => {
    const cache = new StaleWhileRevalidateCache(new MemoryCacheStore());
    const policy = { freshForMs: 100, staleForMs: 100 };
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loader = async (): Promise<string> => {
      calls += 1;
      await gate;
      return "shared";
    };

    const first = cache.load("concurrent", policy, loader);
    const second = cache.load("concurrent", policy, loader);
    release?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ value: "shared" }),
      expect.objectContaining({ value: "shared" }),
    ]);
    expect(calls).toBe(1);

    await expect(
      cache.load("failed-lock", policy, async () => {
        throw new Error("injected failure");
      }),
    ).rejects.toThrow("injected failure");
    await expect(cache.load("failed-lock", policy, async () => "recovered")).resolves.toMatchObject(
      {
        value: "recovered",
      },
    );
  });

  it("uses expired last-known-good data when a live provider fails", async () => {
    let now = 1_000;
    const store = new MemoryCacheStore();
    const cache = new StaleWhileRevalidateCache(store, () => now);
    const policy = { freshForMs: 100, staleForMs: 100 };
    await cache.load("fallback", policy, async () => "known-good", false, false, {
      provider: "fixture-provider",
      validate: (value) => {
        if (typeof value !== "string") {
          throw new Error("not a string");
        }
        return value;
      },
    });
    now = 10_000;

    const result = await cache.load(
      "fallback",
      policy,
      async () => {
        throw new ProviderError("provider offline", "PROVIDER_UNAVAILABLE", true);
      },
      false,
      false,
      {
        provider: "fixture-provider",
        validate: (value) => String(value),
      },
    );
    expect(result).toMatchObject({
      value: "known-good",
      status: "stale",
      staleReason: "expired-fallback",
      nextRetryAt: 70_000,
      metadata: {
        provider: "fixture-provider",
        ageMs: 9_000,
        lastFailedRefreshAt: 10_000,
        lastFailureCode: "GC-PROVIDER-001",
      },
      refreshError: {
        code: "GC-PROVIDER-001",
      },
    });
  });

  it("quarantines invalid cached data before use and exposes only a redacted sample", async () => {
    const store = new MemoryCacheStore();
    await store.set("public:corrupt", {
      metadataVersion: 1,
      value: { displayName: "Private Hero", invalid: true },
      provider: "fixture-provider",
      fetchedAt: 1_000,
      storedAt: 1_000,
      freshUntil: 2_000,
      staleUntil: 3_000,
      lastSuccessfulRefreshAt: 1_000,
    });
    const cache = new StaleWhileRevalidateCache(store, () => 1_100);
    const result = await cache.load(
      "corrupt",
      { freshForMs: 100, staleForMs: 100 },
      async () => "recovered",
      false,
      false,
      {
        provider: "fixture-provider",
        validate: (value) => {
          if (typeof value !== "string") {
            throw new Error("expected a string");
          }
          return value;
        },
      },
    );

    expect(result).toMatchObject({ value: "recovered", status: "miss" });
    const quarantined = await store.listQuarantined();
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({
      provider: "fixture-provider",
      errorCode: "GC-CACHE-005",
    });
    expect(JSON.stringify(quarantined)).not.toContain("Private Hero");
    expect(await store.restoreQuarantined(quarantined[0]!.quarantineId)).toBe(true);
  });

  it("quarantines an invalid provider payload without replacing valid cached data", async () => {
    const store = new MemoryCacheStore();
    const cache = new StaleWhileRevalidateCache(store, () => 1_000);
    const policy = { freshForMs: 100, staleForMs: 100 };
    const validate = (value: unknown): string => {
      if (typeof value !== "string") {
        throw new Error("expected a string");
      }
      return value;
    };
    await cache.load("payload", policy, async () => "known-good", false, false, {
      provider: "fixture-provider",
      validate,
    });

    const result = await cache.load(
      "payload",
      policy,
      async () => ({ displayName: "Private Hero", malformed: true }) as never,
      true,
      false,
      { provider: "fixture-provider", validate },
    );
    expect(result).toMatchObject({
      value: "known-good",
      status: "stale",
      staleReason: "provider-failure",
      refreshError: { code: "GC-PROVIDER-004" },
    });
    expect((await store.get<string>("public:payload"))?.value).toBe("known-good");
    const quarantined = await store.listQuarantined();
    expect(quarantined[0]).toMatchObject({ errorCode: "GC-CACHE-004" });
    expect(JSON.stringify(quarantined)).not.toContain("Private Hero");
  });

  it("clears only quarantine records older than the confirmed retention cutoff", async () => {
    const store = new MemoryCacheStore();
    const entry = {
      metadataVersion: 1 as const,
      value: "invalid",
      provider: "fixture-provider",
      fetchedAt: 1,
      storedAt: 1,
      freshUntil: 2,
      staleUntil: 3,
      lastSuccessfulRefreshAt: 1,
    };
    await store.quarantine("old", entry, {
      quarantineId: "00000000-0000-4000-8000-000000000001",
      provider: "fixture-provider",
      quarantinedAt: 100,
      storedAt: 1,
      errorCode: "GC-CACHE-005",
      reason: "old record",
    });
    await store.quarantine("current", entry, {
      quarantineId: "00000000-0000-4000-8000-000000000002",
      provider: "fixture-provider",
      quarantinedAt: 200,
      storedAt: 1,
      errorCode: "GC-CACHE-005",
      reason: "current record",
    });

    expect(await store.clearExpiredQuarantine(200)).toBe(1);
    expect(await store.listQuarantined()).toEqual([
      expect.objectContaining({
        quarantineId: "00000000-0000-4000-8000-000000000002",
      }),
    ]);
  });

  it("never serves live-only data in offline mode", async () => {
    const store = new MemoryCacheStore();
    const cache = new StaleWhileRevalidateCache(store, () => 1_000);
    await cache.load(
      "live",
      { freshForMs: 100, staleForMs: 100 },
      async () => "value",
      false,
      false,
      { provider: "fixture-provider" },
    );
    await expect(
      cache.load("live", { freshForMs: 100, staleForMs: 100 }, async () => "ignored", false, true, {
        provider: "fixture-provider",
        liveOnly: true,
      }),
    ).rejects.toMatchObject({
      code: "OFFLINE_CACHE_MISS",
      gielinorError: expect.objectContaining({ code: "GC-CACHE-001" }),
    });
  });
});
