#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";

import {
  GrandExchangeService,
  LevellingPlannerService,
  MarketIntelligenceService,
  PlayerPrivateDataService,
  ProfileService,
  QuestService,
} from "@gielinor/core";
import {
  openResilientDatabase,
  SqliteCacheStore,
  SqliteDiagnosticsRepository,
  SqlitePriceRepository,
  SqlitePlayerPrivateDataRepository,
  SqlitePlayerProfileRepository,
  SqliteQuestRepository,
  SqliteTrainingMethodRepository,
} from "@gielinor/database";
import { createDefaultProviderStack, loadProviderConfig } from "@gielinor/providers";
import {
  APPLICATION_VERSION,
  assertSupportedNodeVersion,
  toGielinorError,
} from "@gielinor/shared-types";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCompanionServer } from "./server.js";
import { RuntimeDiagnosticsService } from "./diagnostics-service.js";
import {
  createCatalogueMaintenanceRuntime,
  loadMaintenanceRuntimePolicy,
  type CatalogueMaintenanceRuntime,
} from "./maintenance-runtime.js";
import { CompanionToolService } from "./tool-service.js";
import { OfflineModeController } from "./offline-mode.js";
import { SoftwareUpdateService, softwareUpdateChecksEnabled } from "./update-service.js";

async function main(): Promise<void> {
  assertSupportedNodeVersion();
  const config = loadProviderConfig();
  const databasePath =
    process.env.GIELINOR_DB_PATH ?? join(homedir(), ".gielinor-companion", "gielinor.db");
  const databaseRuntime = openResilientDatabase(databasePath);
  const database = databaseRuntime.database;
  if (databaseRuntime.state.status === "safe-mode") {
    process.stderr.write(
      `Gielinor Companion database safe mode: ${databaseRuntime.state.error?.code ?? "GC-DB-004"}; trace ${databaseRuntime.state.error?.traceId ?? "unavailable"}\n`,
    );
  }
  const cacheStore = new SqliteCacheStore(database);
  const offlineMode = new OfflineModeController(database, config.offline);
  const providers = createDefaultProviderStack(config, cacheStore, () => offlineMode.isOffline());
  const statsProvider = providers.ports;
  const priceProvider = providers.ports;
  const profileRepository = new SqlitePlayerProfileRepository(database);
  const profiles = new ProfileService(profileRepository, statsProvider);
  const playerPrivateData = new PlayerPrivateDataService(
    new SqlitePlayerPrivateDataRepository(database),
    profileRepository,
  );
  const quests = new QuestService(
    new SqliteQuestRepository(database),
    profiles,
    providers.ports.quests,
  );
  const planner = new LevellingPlannerService(
    new SqliteTrainingMethodRepository(database),
    profiles,
    quests,
    providers.ports.training,
  );
  const priceRepository = new SqlitePriceRepository(database);
  const exchange = new GrandExchangeService(priceRepository, priceProvider, quests, planner);
  const marketIntelligence = new MarketIntelligenceService(
    priceRepository,
    providers.marketHistory,
    playerPrivateData,
    Date.now,
    providers.news,
    providers.jagexMarketHistory,
  );
  const diagnosticsRepository =
    databaseRuntime.state.status === "safe-mode"
      ? undefined
      : new SqliteDiagnosticsRepository(database);
  const maintenancePolicy = loadMaintenanceRuntimePolicy();
  const updateChecker = new SoftwareUpdateService({
    installedVersion: APPLICATION_VERSION,
    cacheStore,
    userAgent: config.userAgent,
    offline: () => offlineMode.isOffline(),
    enabled: softwareUpdateChecksEnabled(),
    checkIntervalMs: maintenancePolicy.intervals["software-update-check"],
    timeoutMs: config.timeoutMs,
  });
  let maintenance: CatalogueMaintenanceRuntime | undefined;
  if (databaseRuntime.state.status !== "safe-mode") {
    try {
      maintenance = await createCatalogueMaintenanceRuntime({
        database,
        quests,
        planner,
        exchange,
        offline: () => offlineMode.isOffline(),
        policy: maintenancePolicy,
        diagnostics: diagnosticsRepository,
        updateChecker,
      });
      if (process.env.GIELINOR_RUNTIME_MODE !== "desktop-ephemeral") {
        maintenance.start();
      }
    } catch (error) {
      const structured = toGielinorError(error, {
        fallbackCode: "GC-SCHED-001",
        source: "mcp-server",
        operation: "maintenance-startup",
      });
      process.stderr.write(
        `Gielinor Companion maintenance unavailable: ${structured.code}; trace ${structured.traceId}\n`,
      );
      diagnosticsRepository?.recordError(structured);
    }
  }
  const diagnostics = new RuntimeDiagnosticsService({
    database,
    databaseRecovery: databaseRuntime.state,
    providerRegistry: providers.registry,
    cacheStore,
    quests,
    planner,
    exchange,
    maintenance,
    maintenancePolicy,
    updateChecker,
    offline: () => offlineMode.isOffline(),
    repository: diagnosticsRepository,
  });
  const tools = new CompanionToolService(
    profiles,
    priceProvider,
    quests,
    planner,
    exchange,
    diagnostics,
    playerPrivateData,
    marketIntelligence,
    offlineMode,
    process.env.GIELINOR_RUNTIME_MODE === "desktop-ephemeral" ? "native-real" : "local-stdio-real",
  );
  const server = createCompanionServer(tools, {
    recordError: (error) => diagnostics.recordError(error),
  });
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    await maintenance?.stop();
    await server.close();
    databaseRuntime.close();
  };
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`Gielinor Companion MCP failed to start: ${message}\n`);
  process.exitCode = 1;
});
