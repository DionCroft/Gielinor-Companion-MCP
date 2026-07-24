import { describe, expect, it, vi } from "vitest";

import { MemoryCacheStore, StaleWhileRevalidateCache } from "../src/cache.js";

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
});
