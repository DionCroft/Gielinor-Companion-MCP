import { openDatabase, SqliteDiagnosticsRepository } from "@gielinor/database";
import {
  createDefaultProviderStack,
  loadProviderConfig,
  MemoryCacheStore,
} from "@gielinor/providers";
import { describe, expect, it } from "vitest";

import { RuntimeDiagnosticsService } from "../src/diagnostics-service.js";
import { loadMaintenanceRuntimePolicy } from "../src/maintenance-runtime.js";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

function status(
  kind: "quests" | "training" | "prices",
  lastSuccessfulSyncAt = "2026-07-24T11:00:00.000Z",
) {
  const base = {
    state: "ready" as const,
    provider: "fixture",
    lastSuccessfulSyncAt,
  };
  if (kind === "quests") {
    return { ...base, questCount: 200 };
  }
  if (kind === "training") {
    return { ...base, methodCount: 500, coveredSkills: [] };
  }
  return {
    ...base,
    itemCount: 7_000,
    historyItemCount: 0,
    historyPointCount: 0,
  };
}

function createDiagnostics(options: { offline?: boolean; questLastSuccess?: string } = {}) {
  const database = openDatabase(":memory:");
  const repository = new SqliteDiagnosticsRepository(database);
  const cacheStore = new MemoryCacheStore();
  const providers = createDefaultProviderStack(loadProviderConfig({}), cacheStore);
  const diagnostics = new RuntimeDiagnosticsService({
    database,
    databaseRecovery: {
      status: "ready",
      mode: "read-write",
      checkedAt: new Date(NOW).toISOString(),
      schemaVersion: 6,
      action: "verified",
      originalPreserved: true,
      suggestedActions: [],
    },
    providerRegistry: providers.registry,
    cacheStore,
    quests: {
      getDataStatus: async () => status("quests", options.questLastSuccess),
    } as never,
    planner: { getDataStatus: async () => status("training") } as never,
    exchange: { getDataStatus: async () => status("prices") } as never,
    maintenancePolicy: loadMaintenanceRuntimePolicy({}),
    offline: options.offline ?? false,
    repository,
    configuration: {
      safeMode: false,
      databasePath: "C:\\private\\player.db",
      operatorToken: "secret",
    },
    recentLogs: () => [
      { event: "provider_failure", authorization: "Bearer secret", filePath: "C:\\private\\db" },
    ],
    now: () => NOW,
  });
  return { cacheStore, database, diagnostics };
}

describe("runtime diagnostics service", () => {
  it("aggregates live runtime sources without contacting providers", async () => {
    const { database, diagnostics } = createDiagnostics();
    await expect(diagnostics.getSystemHealth()).resolves.toMatchObject({
      overall: "healthy",
      database: { state: "healthy" },
      scheduler: { state: "disabled" },
      catalogues: [
        { catalogue: "quests", state: "fresh", recordCount: 200 },
        { catalogue: "training", state: "fresh", recordCount: 500 },
        { catalogue: "prices", state: "fresh", recordCount: 7_000 },
      ],
    });
    expect(diagnostics.getProviderHealth()).toHaveLength(6);
    database.close();
  });

  it("cleans only expired quarantine and resets one explicitly selected circuit", async () => {
    const { cacheStore, database, diagnostics } = createDiagnostics();
    const entry = {
      metadataVersion: 1 as const,
      value: "invalid",
      provider: "fixture",
      fetchedAt: 1,
      storedAt: 1,
      freshUntil: 2,
      staleUntil: 3,
      lastSuccessfulRefreshAt: 1,
    };
    await cacheStore.quarantine("expired", entry, {
      quarantineId: "00000000-0000-4000-8000-000000000041",
      provider: "fixture",
      quarantinedAt: NOW - 31 * 24 * 60 * 60_000,
      storedAt: 1,
      errorCode: "GC-CACHE-005",
      reason: "expired fixture",
    });
    await cacheStore.quarantine("retained", entry, {
      quarantineId: "00000000-0000-4000-8000-000000000042",
      provider: "fixture",
      quarantinedAt: NOW - 29 * 24 * 60 * 60_000,
      storedAt: 1,
      errorCode: "GC-CACHE-005",
      reason: "retained fixture",
    });

    await expect(diagnostics.clearExpiredQuarantineRecords(30)).resolves.toMatchObject({
      deleted: 1,
      retentionDays: 30,
    });
    expect(await cacheStore.listQuarantined()).toHaveLength(1);
    const provider = diagnostics.getProviderHealth()[0]!;
    expect(
      diagnostics.resetProviderCircuit(provider.providerId, provider.capability),
    ).toMatchObject({
      providerId: provider.providerId,
      capability: provider.capability,
      resetCount: 1,
      state: "closed",
    });
    database.close();
  });

  it("reports stale and offline states with an entirely redacted export", async () => {
    const { database, diagnostics } = createDiagnostics({
      offline: true,
      questLastSuccess: "2026-07-20T12:00:00.000Z",
    });
    const health = await diagnostics.getSystemHealth();
    expect(health.overall).toBe("offline");
    expect(health.catalogues[0]).toMatchObject({ catalogue: "quests", state: "offline" });
    const exported = await diagnostics.exportRedactedDiagnostics();
    expect(exported.configuration).not.toHaveProperty("databasePath");
    expect(exported.configuration).not.toHaveProperty("operatorToken");
    expect(exported.recentLogs[0]).toEqual({
      event: "provider_failure",
      authorization: "[redacted]",
      filePath: "[redacted]",
    });
    expect(JSON.stringify(exported)).not.toContain("player.db");
    expect(JSON.stringify(exported)).not.toContain("C:\\private");
    expect(JSON.stringify(exported)).not.toContain("Bearer secret");
    expect(diagnostics.runDatabaseIntegrityCheck()).toMatchObject({
      state: "healthy",
      lastSuccessAt: new Date(NOW).toISOString(),
    });
    database.close();
  });
});
