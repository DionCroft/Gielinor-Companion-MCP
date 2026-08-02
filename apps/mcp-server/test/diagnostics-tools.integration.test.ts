import type { PriceProvider, ProfileService } from "@gielinor/core";
import { createGielinorError, type SystemHealth } from "@gielinor/shared-types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService, type DiagnosticsToolBackend } from "../src/tool-service.js";

const NOW = "2026-07-24T12:00:00.000Z";
const TRACE_ID = "00000000-0000-4000-8000-000000000011";

const health: SystemHealth = {
  overall: "degraded",
  database: {
    id: "database",
    state: "healthy",
    message: "SQLite integrity and schema are ready",
    checkedAt: NOW,
    lastSuccessAt: NOW,
  },
  providers: [],
  catalogues: [
    {
      catalogue: "quests",
      state: "stale",
      recordCount: 200,
      freshnessIntervalMs: 86_400_000,
      ageMs: 90_000_000,
      lastSuccessAt: "2026-07-23T11:00:00.000Z",
    },
  ],
  scheduler: {
    state: "degraded",
    enabled: true,
    runningJobs: 0,
    failedJobs: 1,
    jobs: [],
    checkedAt: NOW,
  },
  updateChecker: {
    id: "update-checker",
    state: "healthy",
    message: "Validated release metadata is cached",
    checkedAt: NOW,
  },
  activeErrors: [],
  recentRecoveries: [],
  checkedAt: NOW,
};

function diagnosticsBackend(): DiagnosticsToolBackend {
  const error = createGielinorError("GC-SYNC-001", {
    timestamp: NOW,
    traceId: TRACE_ID,
    source: "fixture",
  });
  return {
    getSystemHealth: async () => health,
    getProviderHealth: () => [],
    getCatalogueHealth: async () => health.catalogues,
    listRecentErrors: () => [error],
    listRecoveryEvents: () => [
      {
        eventId: "00000000-0000-4000-8000-000000000012",
        component: "scheduler",
        action: "Recovered quest refresh",
        outcome: "succeeded",
        automatic: true,
        occurredAt: NOW,
      },
    ],
    retryFailedOperation: async (operation) => ({
      status: "success",
      jobName: operation,
    }),
    refreshStaleCatalogues: async () => ({
      results: [{ status: "success", jobName: "quest-refresh" }],
      refreshed: ["quests"],
      alreadyFresh: ["training", "prices"],
    }),
    runDatabaseIntegrityCheck: () => ({
      id: "database",
      state: "healthy",
      message: "SQLite quick integrity check passed",
      checkedAt: NOW,
      lastSuccessAt: NOW,
    }),
    exportRedactedDiagnostics: async () => ({
      exportVersion: 1,
      generatedAt: NOW,
      application: {
        version: "1.1.0",
        operatingSystem: "test",
        architecture: "x64",
        nodeVersion: process.version,
        databaseSchemaVersion: 6,
        mcpContractVersion: "1.1",
      },
      health,
      configuration: { offline: false },
      recentErrors: [error],
      recentRecoveries: [],
      recentLogs: [],
      redactionNotice: "Sensitive values are excluded.",
    }),
    checkForSoftwareUpdates: async () => ({
      state: "up-to-date",
      installedVersion: "1.1.0",
      checkedAt: NOW,
      nextCheckAt: "2026-07-25T12:00:00.000Z",
      source: "cache",
      message: "Version 1.1.0 is up to date",
      warnings: [],
      traceId: TRACE_ID,
    }),
    clearExpiredQuarantineRecords: async (retentionDays = 30) => ({
      deleted: 2,
      cutoffAt: "2026-06-24T12:00:00.000Z",
      retentionDays,
    }),
    resetProviderCircuit: (providerId, capability) => ({
      providerId,
      capability,
      resetCount: 1,
      state: "closed",
    }),
  };
}

const servers: ReturnType<typeof createCompanionServer>[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("MCP 1.1 diagnostics tools through the protocol boundary", () => {
  it("lists and executes every additive tool with trace and recovery metadata", async () => {
    const service = new CompanionToolService(
      {} as ProfileService,
      {} as PriceProvider,
      undefined,
      undefined,
      undefined,
      diagnosticsBackend(),
    );
    const server = createCompanionServer(service);
    const client = new Client({ name: "diagnostics-integration-test", version: "1.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const additive = [
      ["get_system_health", {}],
      ["get_provider_health", {}],
      ["get_catalogue_health", {}],
      ["list_recent_errors", { limit: 20, activeOnly: true }],
      ["list_recovery_events", { limit: 20 }],
      ["retry_failed_operation", { operation: "quest-refresh" }],
      ["refresh_stale_catalogues", { catalogues: ["quests"] }],
      ["run_database_integrity_check", {}],
      ["export_redacted_diagnostics", {}],
      ["check_for_software_updates", { includePrereleases: false, forceRefresh: false }],
      ["clear_expired_quarantine_records", { retentionDays: 30 }],
      [
        "reset_provider_circuit",
        { providerId: "jagex.itemdb", capability: "current-price", confirmed: true },
      ],
    ] as const;
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(93);
    expect(listed.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(additive.map(([name]) => name)),
    );

    for (const [name, arguments_] of additive) {
      const result = await client.callTool({ name, arguments: arguments_ });
      expect(result.isError, name).not.toBe(true);
      expect(result.structuredContent, name).toMatchObject({
        meta: {
          generatedAt: expect.any(String),
          traceId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
          recoveryStatus: expect.any(String),
        },
      });
    }
  });

  it("rejects unknown fields through the actual MCP input validator", async () => {
    const server = createCompanionServer(
      new CompanionToolService(
        {} as ProfileService,
        {} as PriceProvider,
        undefined,
        undefined,
        undefined,
        diagnosticsBackend(),
      ),
    );
    const client = new Client({ name: "strict-schema-test", version: "1.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({
      name: "get_system_health",
      arguments: { unexpected: true },
    });
    expect(result.isError).toBe(true);
    const unconfirmedReset = await client.callTool({
      name: "reset_provider_circuit",
      arguments: {
        providerId: "jagex.itemdb",
        capability: "current-price",
        confirmed: false,
      },
    });
    expect(unconfirmedReset.isError).toBe(true);
  });
});
