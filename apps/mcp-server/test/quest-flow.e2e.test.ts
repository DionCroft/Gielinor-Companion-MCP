import type { PlayerStatsProvider, PriceProvider, QuestDataProvider } from "@gielinor/core";
import { PlayerPrivateDataService, ProfileService, QuestService } from "@gielinor/core";
import {
  openDatabase,
  SqlitePlayerPrivateDataRepository,
  SqlitePlayerProfileRepository,
  SqliteQuestRepository,
} from "@gielinor/database";
import { QuestDataSnapshotSchema, QuestSchema, type Quest } from "@gielinor/shared-types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService } from "../src/tool-service.js";

const CHECKED_AT = "2026-07-23T12:00:00.000Z";

function quest(
  id: string,
  prerequisiteQuestIds: string[],
  items: Quest["itemRequirements"],
): Quest {
  return QuestSchema.parse({
    id,
    name: id === "target" ? "Target Quest" : "Prerequisite",
    aliases: id === "target" ? ["The Target"] : [],
    members: true,
    prerequisiteQuestIds,
    prerequisiteGroups:
      prerequisiteQuestIds.length === 0
        ? []
        : [
            {
              mode: "all",
              quests: prerequisiteQuestIds.map((questId) => ({
                questId,
                requiredStatus: "completed",
              })),
            },
          ],
    skillRequirements: [],
    otherRequirements: [],
    itemRequirements: items,
    recommendedItems: [],
    rewards: [],
    guideUrl: `https://example.test/${id}`,
    sourcePageUrl: `https://example.test/${id}`,
    sourceName: "fixture",
    sourceRevision: "1",
    sourceUpdatedAt: CHECKED_AT,
    contentHash: id === "target" ? "a".repeat(64) : "b".repeat(64),
    lastCheckedAt: CHECKED_AT,
  });
}

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

describe("quest companion end-to-end MCP flow", () => {
  it("refreshes, tracks progress, creates a route, and aggregates shopping items", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const questProvider: QuestDataProvider = {
      fetchSnapshot: async () =>
        QuestDataSnapshotSchema.parse({
          provider: "fixture",
          sourceUrl: "https://example.test/quests",
          sourceRevision: "snapshot-1",
          retrievedAt: CHECKED_AT,
          quests: [
            quest("prerequisite", [], [{ name: "Rune bar", itemId: 2363, quantity: 2 }]),
            quest("target", ["prerequisite"], [{ name: "Rune bar", itemId: 2363, quantity: 3 }]),
          ],
        }),
    };
    const profileRepository = new SqlitePlayerProfileRepository(database);
    const profiles = new ProfileService(profileRepository, {} as PlayerStatsProvider);
    const privateData = new PlayerPrivateDataService(
      new SqlitePlayerPrivateDataRepository(database),
      profileRepository,
    );
    const quests = new QuestService(new SqliteQuestRepository(database), profiles, questProvider);
    const server = createCompanionServer(
      new CompanionToolService(
        profiles,
        {} as PriceProvider,
        quests,
        undefined,
        undefined,
        undefined,
        privateData,
      ),
    );
    const client = new Client({ name: "quest-e2e", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const refreshed = await client.callTool({ name: "refresh_quest_data", arguments: {} });
    expect(refreshed.structuredContent).toMatchObject({
      data: { total: 2, inserted: 2, updated: 0 },
    });

    const created = await client.callTool({
      name: "create_player_profile",
      arguments: { displayName: "Rune Tester", gameMode: "normal" },
    });
    const profileId = (created.structuredContent as { data: { id: string } } | undefined)?.data.id;
    expect(profileId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const initialRoute = await client.callTool({
      name: "create_quest_route",
      arguments: { profileId, quest: "The Target" },
    });
    expect(initialRoute.structuredContent).toMatchObject({
      data: {
        targetQuestId: "target",
        steps: [{ questId: "prerequisite" }, { questId: "target" }],
      },
    });

    await client.callTool({
      name: "set_quest_status",
      arguments: { profileId, quest: "Prerequisite", status: "completed" },
    });
    const shopping = await client.callTool({
      name: "create_quest_shopping_list",
      arguments: { profileId, quest: "target" },
    });
    expect(shopping.structuredContent).toMatchObject({
      data: {
        routeQuestIds: ["target"],
        items: [
          {
            name: "Rune bar",
            quantity: 3,
            requiredByQuestIds: ["target"],
          },
        ],
      },
    });

    await client.callTool({
      name: "replace_player_holdings",
      arguments: {
        profileId,
        items: [{ itemId: 2363, quantity: 2 }],
        source: "manual",
        confirmReplace: true,
      },
    });
    const accountAwareShopping = await client.callTool({
      name: "create_account_aware_quest_shopping_list",
      arguments: { profileId, quest: "target", subtractOwned: true },
    });
    expect(accountAwareShopping.structuredContent).toMatchObject({
      data: {
        items: [
          {
            itemId: 2363,
            name: "Rune bar",
            quantity: 1,
            requiredQuantity: 3,
            ownedQuantityApplied: 2,
          },
        ],
        subtraction: {
          requested: true,
          status: "applied",
          dataClassification: "user-entered local data",
          holdingsSource: "manual",
          unresolvedItems: [],
        },
      },
    });
  });
});
