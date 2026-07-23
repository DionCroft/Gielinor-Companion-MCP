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
});
