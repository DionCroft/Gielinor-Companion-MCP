import {
  PlayerPrivateDataService,
  ProfileService,
  type PlayerStatsProvider,
  type PriceProvider,
} from "@gielinor/core";
import {
  openDatabase,
  SqlitePlayerPrivateDataRepository,
  SqlitePlayerProfileRepository,
} from "@gielinor/database";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService } from "../src/tool-service.js";

const servers: ReturnType<typeof createCompanionServer>[] = [];
const clients: Client[] = [];
const databases: ReturnType<typeof openDatabase>[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const database of databases.splice(0)) {
    database.close();
  }
});

async function connectedClient() {
  const database = openDatabase(":memory:");
  databases.push(database);
  const profileRepository = new SqlitePlayerProfileRepository(database);
  const profiles = new ProfileService(profileRepository, {} as PlayerStatsProvider);
  const privateData = new PlayerPrivateDataService(
    new SqlitePlayerPrivateDataRepository(database),
    profileRepository,
  );
  const tools = new CompanionToolService(
    profiles,
    {} as PriceProvider,
    undefined,
    undefined,
    undefined,
    undefined,
    privateData,
  );
  const server = createCompanionServer(tools);
  const client = new Client({ name: "private-data-test", version: "1.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  servers.push(server);
  clients.push(client);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("player-private data over the real MCP boundary", () => {
  it("persists selected profile, holdings and manually recorded trades", async () => {
    const client = await connectedClient();
    const created = await client.callTool({
      name: "create_player_profile",
      arguments: { displayName: "Private Hero", gameMode: "normal" },
    });
    const profileId = (created.structuredContent as { data: { id: string } }).data.id;

    const unconfirmed = await client.callTool({
      name: "replace_player_holdings",
      arguments: {
        profileId,
        items: [{ itemId: 4151, quantity: 2 }],
        confirmReplace: false,
      },
    });
    expect(unconfirmed.isError).toBe(true);

    await client.callTool({
      name: "set_selected_player_profile",
      arguments: { profileId },
    });
    const holdings = await client.callTool({
      name: "replace_player_holdings",
      arguments: {
        profileId,
        cashGp: 1_000_000,
        items: [{ itemId: 4151, quantity: 2, averageAcquisitionPrice: 80_000 }],
        source: "manual",
        confirmReplace: true,
      },
    });
    expect(holdings.isError).not.toBe(true);
    expect(holdings.structuredContent).toMatchObject({
      data: { profileId, cashGp: 1_000_000, source: "manual" },
      meta: { source: "user-confirmed local holdings snapshot" },
    });

    const trade = await client.callTool({
      name: "record_ge_trade",
      arguments: {
        profileId,
        itemId: 4151,
        side: "buy",
        quantity: 2,
        unitPrice: 80_000,
        occurredAt: "2026-08-02T12:00:00.000Z",
        source: "manual",
      },
    });
    expect(trade.isError).not.toBe(true);

    const snapshot = await client.callTool({
      name: "get_selected_player_snapshot",
      arguments: {},
    });
    expect(snapshot.structuredContent).toMatchObject({
      data: {
        profile: { id: profileId },
        holdings: { items: [{ itemId: 4151, quantity: 2 }] },
        marketPreferences: { strategy: "balanced" },
      },
    });
    const trades = await client.callTool({
      name: "list_ge_trades",
      arguments: { profileId },
    });
    expect((trades.structuredContent as { data: unknown[] }).data).toHaveLength(1);

    const paperTrade = await client.callTool({
      name: "record_paper_trade",
      arguments: {
        profileId,
        itemId: 4151,
        side: "buy",
        quantity: 2,
        unitPrice: 80_000,
        initialCashGp: 1_000_000,
      },
    });
    expect(paperTrade.structuredContent).toMatchObject({
      data: { cashGp: 840_000, holdings: [{ itemId: 4151, quantity: 2 }] },
      meta: { source: expect.stringContaining("hypothetical") },
    });
    const paperPortfolio = await client.callTool({
      name: "get_paper_portfolio",
      arguments: { profileId },
    });
    expect(paperPortfolio.structuredContent).toMatchObject({
      data: { cashGp: 840_000, trades: [{ source: "paper-simulation" }] },
    });
  });
});
