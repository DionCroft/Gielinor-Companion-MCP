#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";

import {
  GrandExchangeService,
  LevellingPlannerService,
  ProfileService,
  QuestService,
} from "@gielinor/core";
import {
  openDatabase,
  SqliteCacheStore,
  SqlitePriceRepository,
  SqlitePlayerProfileRepository,
  SqliteQuestRepository,
  SqliteTrainingMethodRepository,
} from "@gielinor/database";
import { createDefaultProviderStack, loadProviderConfig } from "@gielinor/providers";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCompanionServer } from "./server.js";
import { CompanionToolService } from "./tool-service.js";

async function main(): Promise<void> {
  const config = loadProviderConfig();
  const databasePath =
    process.env.GIELINOR_DB_PATH ?? join(homedir(), ".gielinor-companion", "gielinor.db");
  const database = openDatabase(databasePath);
  const cacheStore = new SqliteCacheStore(database);
  const providers = createDefaultProviderStack(config, cacheStore);
  const statsProvider = providers.ports;
  const priceProvider = providers.ports;
  const profiles = new ProfileService(new SqlitePlayerProfileRepository(database), statsProvider);
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
  const exchange = new GrandExchangeService(
    new SqlitePriceRepository(database),
    priceProvider,
    quests,
    planner,
  );
  const tools = new CompanionToolService(profiles, priceProvider, quests, planner, exchange);
  const server = createCompanionServer(tools);
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    await server.close();
    database.close();
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
