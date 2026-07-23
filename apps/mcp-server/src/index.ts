#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";

import { ProfileService, QuestService } from "@gielinor/core";
import {
  openDatabase,
  SqliteCacheStore,
  SqlitePlayerProfileRepository,
  SqliteQuestRepository,
} from "@gielinor/database";
import {
  JagexGrandExchangeProvider,
  JagexHiscoresProvider,
  ResilientHttpClient,
  RuneScapeWikiQuestProvider,
  loadProviderConfig,
} from "@gielinor/providers";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCompanionServer } from "./server.js";
import { CompanionToolService } from "./tool-service.js";

async function main(): Promise<void> {
  const config = loadProviderConfig();
  const databasePath =
    process.env.GIELINOR_DB_PATH ?? join(homedir(), ".gielinor-companion", "gielinor.db");
  const database = openDatabase(databasePath);
  const cacheStore = new SqliteCacheStore(database);
  const httpClient = new ResilientHttpClient({
    userAgent: config.userAgent,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
  });
  const statsProvider = new JagexHiscoresProvider({
    httpClient,
    cacheStore,
    cachePolicy: config.hiscoresCache,
    normalEndpoint: config.hiscoresUrl,
  });
  const priceProvider = new JagexGrandExchangeProvider({
    httpClient,
    cacheStore,
    cachePolicy: config.geCache,
    endpoint: config.geUrl,
  });
  const profiles = new ProfileService(new SqlitePlayerProfileRepository(database), statsProvider);
  const quests = new QuestService(
    new SqliteQuestRepository(database),
    profiles,
    new RuneScapeWikiQuestProvider({
      httpClient,
      apiUrl: config.wikiApiUrl,
      pageUrl: config.wikiPageUrl,
    }),
  );
  const tools = new CompanionToolService(profiles, priceProvider, quests);
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
