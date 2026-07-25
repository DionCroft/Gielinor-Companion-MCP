import { describe, expect, it } from "vitest";

import { ProviderCircuitBreakers } from "../src/circuit-breaker.js";
import { ProviderError } from "../src/http.js";
import {
  PROVIDER_PLUGIN_API_VERSION,
  ProviderRegistry,
  type ProviderPlugin,
} from "../src/plugin.js";
import { fixturePrice, fixturePricePlugin } from "./fixtures/provider-contract.js";

describe("ProviderCircuitBreakers", () => {
  it("opens after the threshold and permits exactly one half-open probe", () => {
    let now = 0;
    const circuits = new ProviderCircuitBreakers({
      policy: {
        failureThreshold: 2,
        cooldownMs: 100,
        maximumCooldownMs: 1_000,
      },
      now: () => now,
    });
    circuits.track("fixture.primary", "current-price");
    circuits.failure("fixture.primary", "current-price");
    expect(circuits.acquire("fixture.primary", "current-price")).toEqual({
      allowed: true,
      state: "closed",
    });
    circuits.failure("fixture.primary", "current-price");
    expect(circuits.snapshot()[0]).toMatchObject({
      state: "open",
      failureCount: 2,
      currentCooldownMs: 100,
      nextProbeAt: "1970-01-01T00:00:00.100Z",
    });
    expect(circuits.acquire("fixture.primary", "current-price")).toMatchObject({
      allowed: false,
      state: "open",
      nextProbeAt: 100,
    });

    now = 100;
    expect(circuits.acquire("fixture.primary", "current-price")).toEqual({
      allowed: true,
      state: "half-open",
    });
    expect(circuits.acquire("fixture.primary", "current-price")).toMatchObject({
      allowed: false,
      state: "half-open",
    });
    circuits.success("fixture.primary", "current-price");
    expect(circuits.snapshot()[0]).toMatchObject({
      state: "closed",
      failureCount: 0,
      halfOpenProbeInFlight: false,
    });
  });

  it("reopens with a longer cooldown after a failed probe and supports reset", () => {
    let now = 0;
    const circuits = new ProviderCircuitBreakers({
      policy: {
        failureThreshold: 1,
        cooldownMs: 100,
        maximumCooldownMs: 250,
      },
      now: () => now,
    });
    circuits.failure("fixture.primary", "current-price");
    now = 100;
    expect(circuits.acquire("fixture.primary", "current-price")).toMatchObject({
      allowed: true,
      state: "half-open",
    });
    circuits.failure("fixture.primary", "current-price");
    expect(circuits.snapshot()[0]).toMatchObject({
      state: "open",
      currentCooldownMs: 200,
      nextProbeAt: "1970-01-01T00:00:00.300Z",
    });
    expect(circuits.reset("fixture.primary", "current-price")).toBe(1);
    expect(circuits.snapshot()[0]).toMatchObject({
      state: "closed",
      failureCount: 0,
      currentCooldownMs: 100,
    });
  });
});

describe("ProviderRegistry circuit fallback", () => {
  it("skips an open primary, keeps the fallback healthy, and closes after a successful probe", async () => {
    let now = 0;
    let primaryCalls = 0;
    let primaryHealthy = false;
    const primary: ProviderPlugin = {
      apiVersion: PROVIDER_PLUGIN_API_VERSION,
      id: "fixture.primary",
      name: "Primary fixture",
      version: "1.0.0",
      capabilities: [
        {
          capability: "current-price",
          priority: 100,
          offlineSupport: "none",
          description: "Stateful circuit-breaker fixture",
          handler: async () => {
            primaryCalls += 1;
            if (!primaryHealthy) {
              throw new ProviderError("upstream unavailable", "PROVIDER_UNAVAILABLE", true);
            }
            return fixturePrice(100, "fixture.primary");
          },
        },
      ],
    };
    const registry = new ProviderRegistry(undefined, {
      policy: {
        failureThreshold: 1,
        cooldownMs: 100,
        maximumCooldownMs: 1_000,
      },
      now: () => now,
    });
    registry.register(primary);
    registry.register(
      fixturePricePlugin({
        id: "fixture.fallback",
        priority: 10,
        currentPrice: 90,
      }),
    );

    const first = await registry.execute("current-price", { itemId: 4151 });
    expect(first.attempts.map((attempt) => attempt.outcome)).toEqual(["failure", "success"]);
    const second = await registry.execute("current-price", { itemId: 4151 });
    expect(second.attempts.map((attempt) => attempt.outcome)).toEqual(["skipped", "success"]);
    expect(primaryCalls).toBe(1);
    expect(registry.circuits.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "fixture.primary",
          state: "open",
        }),
        expect.objectContaining({
          providerId: "fixture.fallback",
          state: "closed",
        }),
      ]),
    );

    now = 100;
    primaryHealthy = true;
    const recovered = await registry.execute("current-price", { itemId: 4151 });
    expect(recovered.selectedPluginId).toBe("fixture.primary");
    expect(primaryCalls).toBe(2);
    expect(
      registry.circuits.snapshot().find((circuit) => circuit.providerId === "fixture.primary"),
    ).toMatchObject({ state: "closed", failureCount: 0 });
  });

  it("allows only one concurrent half-open probe and routes other calls to fallback", async () => {
    let now = 0;
    let primaryCalls = 0;
    let probeMode = false;
    let releaseProbe: (() => void) | undefined;
    const probeGate = new Promise<void>((resolve) => {
      releaseProbe = resolve;
    });
    const primary: ProviderPlugin = {
      apiVersion: PROVIDER_PLUGIN_API_VERSION,
      id: "fixture.concurrent",
      name: "Concurrent fixture",
      version: "1.0.0",
      capabilities: [
        {
          capability: "current-price",
          priority: 100,
          offlineSupport: "none",
          description: "Half-open concurrency fixture",
          handler: async () => {
            primaryCalls += 1;
            if (!probeMode) {
              throw new ProviderError("upstream unavailable", "PROVIDER_UNAVAILABLE", true);
            }
            await probeGate;
            return fixturePrice(100, "fixture.concurrent");
          },
        },
      ],
    };
    const registry = new ProviderRegistry(undefined, {
      policy: {
        failureThreshold: 1,
        cooldownMs: 100,
        maximumCooldownMs: 1_000,
      },
      now: () => now,
    });
    registry.register(primary);
    registry.register(
      fixturePricePlugin({
        id: "fixture.fallback",
        priority: 10,
        currentPrice: 90,
      }),
    );
    await registry.execute("current-price", { itemId: 4151 });

    now = 100;
    probeMode = true;
    const probe = registry.execute("current-price", { itemId: 4151 });
    const concurrent = await registry.execute("current-price", { itemId: 4151 });
    expect(concurrent.selectedPluginId).toBe("fixture.fallback");
    expect(concurrent.attempts[0]).toMatchObject({
      pluginId: "fixture.concurrent",
      outcome: "skipped",
      errorCode: "CIRCUIT_OPEN",
    });
    releaseProbe?.();
    expect((await probe).selectedPluginId).toBe("fixture.concurrent");
    expect(primaryCalls).toBe(2);
  });
});
