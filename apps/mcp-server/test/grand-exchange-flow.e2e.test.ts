import {
  GrandExchangeService,
  type GrandExchangeDataProvider,
  type ProfileService,
} from "@gielinor/core";
import { openDatabase, SqlitePriceRepository } from "@gielinor/database";
import {
  PriceCatalogueItemSchema,
  PriceDataSnapshotSchema,
  type GrandExchangeItem,
  type PricePoint,
} from "@gielinor/shared-types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService } from "../src/tool-service.js";

const CHECKED_AT = "2026-07-23T12:00:00.000Z";
const databases: ReturnType<typeof openDatabase>[] = [];
const servers: ReturnType<typeof createCompanionServer>[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("Grand Exchange intelligence end-to-end MCP flow", () => {
  it("refreshes, searches, analyses, and values validated price data", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const items = [
      PriceCatalogueItemSchema.parse({
        itemId: 4151,
        name: "Abyssal whip",
        aliases: ["Whip"],
        currentPrice: 100_000,
        buyLimit: 10,
        alchemyValue: 72_000,
        volume: 900,
        timestamp: CHECKED_AT,
        sourceName: "fixture GE",
        sourceUrl: "https://example.test/prices",
        retrievedAt: CHECKED_AT,
        contentHash: "a".repeat(64),
      }),
      PriceCatalogueItemSchema.parse({
        itemId: 453,
        name: "Coal",
        aliases: [],
        currentPrice: 500,
        timestamp: CHECKED_AT,
        sourceName: "fixture GE",
        sourceUrl: "https://example.test/prices",
        retrievedAt: CHECKED_AT,
        contentHash: "b".repeat(64),
      }),
    ];
    const provider: GrandExchangeDataProvider = {
      getCurrentPrice: async (): Promise<GrandExchangeItem> => ({
        itemId: 4151,
        name: "Abyssal whip",
        currentPrice: 100_000,
        sourceName: "fixture",
      }),
      getPriceHistory: async (): Promise<PricePoint[]> => [
        { timestamp: "2026-07-21T00:00:00.000Z", price: 90_000 },
        { timestamp: "2026-07-22T00:00:00.000Z", price: 95_000 },
        { timestamp: "2026-07-23T00:00:00.000Z", price: 100_000 },
      ],
      fetchSnapshot: async () =>
        PriceDataSnapshotSchema.parse({
          provider: "fixture GE",
          sourceRevision: "1",
          sourceUpdatedAt: CHECKED_AT,
          retrievedAt: CHECKED_AT,
          items,
        }),
    };
    const exchange = new GrandExchangeService(
      new SqlitePriceRepository(database),
      provider,
      undefined,
      undefined,
      () => Date.parse(CHECKED_AT),
    );
    const server = createCompanionServer(
      new CompanionToolService({} as ProfileService, provider, undefined, undefined, exchange),
    );
    const client = new Client({ name: "ge-e2e", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const refreshed = await client.callTool({
      name: "refresh_price_data",
      arguments: { itemIds: [4151] },
    });
    expect(refreshed.isError).not.toBe(true);
    expect(refreshed.structuredContent).toMatchObject({
      data: {
        catalogue: { total: 2, inserted: 2 },
        histories: [{ itemId: 4151, pointCount: 3 }],
      },
    });

    const searched = await client.callTool({
      name: "search_items",
      arguments: { query: "Whip" },
    });
    expect(searched.structuredContent).toMatchObject({
      data: [{ itemId: 4151, name: "Abyssal whip" }],
    });

    const summary = await client.callTool({
      name: "get_item_price_summary",
      arguments: { item: "Whip", range: "7d" },
    });
    expect(summary.structuredContent).toMatchObject({
      data: {
        currentPrice: 100_000,
        percentageChange: 11.1111,
        historicalHigh: 100_000,
        historicalLow: 90_000,
        chart: [{ price: 90_000 }, { price: 95_000 }, { price: 100_000 }],
      },
    });

    const valued = await client.callTool({
      name: "value_item_list",
      arguments: {
        items: [
          { item: 4151, quantity: 1 },
          { item: "Coal", quantity: 10 },
        ],
      },
    });
    expect(valued.structuredContent).toMatchObject({
      data: { totalValue: 105_000, complete: true },
    });
  });
});
