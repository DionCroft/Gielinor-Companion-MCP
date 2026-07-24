import { describe, expect, it } from "vitest";

import { ProviderError } from "../src/http.js";
import { PROVIDER_PLUGIN_API_VERSION, ProviderRegistry } from "../src/plugin.js";
import { fixturePricePlugin } from "./fixtures/provider-contract.js";

describe("ProviderRegistry", () => {
  it("selects the highest-priority provider without calling lower-priority providers", async () => {
    const registry = new ProviderRegistry();
    registry.register(fixturePricePlugin({ id: "fixture.low", priority: 10, currentPrice: 10 }));
    registry.register(fixturePricePlugin({ id: "fixture.high", priority: 100, currentPrice: 100 }));

    const result = await registry.execute("current-price", { itemId: 4151 });
    expect(result.selectedPluginId).toBe("fixture.high");
    expect(result.value.currentPrice).toBe(100);
    expect(result.attempts).toHaveLength(1);
  });

  it("falls back after provider failures and records actionable health", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      fixturePricePlugin({
        id: "fixture.primary",
        priority: 100,
        failure: new ProviderError("upstream unavailable", "PROVIDER_UNAVAILABLE", true),
      }),
    );
    registry.register(
      fixturePricePlugin({ id: "fixture.fallback", priority: 10, currentPrice: 90 }),
    );

    const result = await registry.execute("current-price", { itemId: 4151 });
    expect(result.selectedPluginId).toBe("fixture.fallback");
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(["failure", "success"]);
    expect(registry.health.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: "fixture.primary",
          state: "degraded",
          lastErrorCode: "PROVIDER_UNAVAILABLE",
        }),
        expect.objectContaining({
          pluginId: "fixture.fallback",
          state: "healthy",
          successfulRequests: 1,
        }),
      ]),
    );
  });

  it("preserves conflicting source results instead of silently merging them", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      fixturePricePlugin({ id: "fixture.authoritative", priority: 100, currentPrice: 100 }),
    );
    registry.register(
      fixturePricePlugin({ id: "fixture.secondary", priority: 50, currentPrice: 95 }),
    );

    const result = await registry.execute("current-price", { itemId: 4151 }, { compareAll: true });
    expect(result.value.currentPrice).toBe(100);
    expect(result.disagreements).toEqual([
      expect.objectContaining({
        selectedPluginId: "fixture.authoritative",
        comparedPluginId: "fixture.secondary",
        selectedValue: expect.objectContaining({ currentPrice: 100 }),
        comparedValue: expect.objectContaining({ currentPrice: 95 }),
      }),
    ]);
  });

  it("rejects malformed high-priority results and uses the next valid provider", async () => {
    const registry = new ProviderRegistry();
    registry.register({
      apiVersion: PROVIDER_PLUGIN_API_VERSION,
      id: "fixture.malformed",
      name: "Malformed fixture",
      version: "1.0.0",
      capabilities: [
        {
          capability: "current-price",
          priority: 100,
          offlineSupport: "none",
          description: "Malformed test result",
          handler: async () => ({ invalid: true }) as never,
        },
      ],
    });
    registry.register(fixturePricePlugin({ id: "fixture.valid", priority: 10 }));

    const result = await registry.execute("current-price", { itemId: 4151 });
    expect(result.selectedPluginId).toBe("fixture.valid");
    expect(result.attempts[0]).toMatchObject({
      pluginId: "fixture.malformed",
      outcome: "failure",
      errorCode: "INVALID_PROVIDER_RESULT",
    });
  });

  it("honours offline capability metadata", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      fixturePricePlugin({
        id: "fixture.network",
        priority: 100,
        currentPrice: 100,
        offlineSupport: "none",
      }),
    );
    registry.register(
      fixturePricePlugin({
        id: "fixture.offline",
        priority: 10,
        currentPrice: 90,
        offlineSupport: "full",
      }),
    );

    const result = await registry.execute("current-price", { itemId: 4151 }, { offline: true });
    expect(result.selectedPluginId).toBe("fixture.offline");
  });

  it("transitions repeatedly failing providers to unavailable", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      fixturePricePlugin({
        id: "fixture.unstable",
        priority: 100,
        failure: new Error("injected network failure"),
      }),
    );
    registry.register(fixturePricePlugin({ id: "fixture.backup", priority: 10 }));

    await registry.execute("current-price", { itemId: 4151 });
    await registry.execute("current-price", { itemId: 4151 });
    await registry.execute("current-price", { itemId: 4151 });

    expect(
      registry.health.snapshot().find((health) => health.pluginId === "fixture.unstable"),
    ).toMatchObject({
      state: "unavailable",
      failedRequests: 3,
      consecutiveFailures: 3,
    });
  });

  it("rejects an invalid plugin atomically", () => {
    const registry = new ProviderRegistry();
    const duplicate = fixturePricePlugin({ id: "fixture.atomic", priority: 10 });
    duplicate.capabilities = [...duplicate.capabilities, duplicate.capabilities[0]!];

    expect(() => registry.register(duplicate)).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_PROVIDER_CAPABILITY" }),
    );
    expect(registry.capabilities()).toEqual([]);
    expect(registry.health.snapshot()).toEqual([]);
  });

  it("rejects incompatible plugin API versions before registration", () => {
    const registry = new ProviderRegistry();
    const incompatible = fixturePricePlugin({ id: "fixture.future", priority: 10 });
    (incompatible as { apiVersion: number }).apiVersion = 2;

    expect(() => registry.register(incompatible)).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_PROVIDER_PLUGIN_API" }),
    );
    expect(registry.capabilities()).toEqual([]);
  });
});
