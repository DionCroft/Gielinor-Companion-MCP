import type {
  GrandExchangeService,
  LevellingPlannerService,
  PriceProvider,
  ProfileService,
  QuestService,
} from "@gielinor/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService } from "../src/tool-service.js";

const servers: ReturnType<typeof createCompanionServer>[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("MCP server protocol integration", () => {
  it("lists tools and returns structured XP results over an MCP transport", async () => {
    const quests = {
      getDataStatus: async () => ({ state: "ready", questCount: 2 }),
    } as unknown as QuestService;
    const planner = {
      getDataStatus: async () => ({
        state: "ready",
        methodCount: 42,
        coveredSkills: ["mining"],
      }),
    } as unknown as LevellingPlannerService;
    const exchange = {
      getDataStatus: async () => ({
        state: "ready",
        itemCount: 7_000,
        historyItemCount: 1,
        historyPointCount: 180,
        catalogueFreshness: { state: "fresh" },
        disclaimer: "fixture",
      }),
    } as unknown as GrandExchangeService;
    const service = new CompanionToolService(
      {} as ProfileService,
      {} as PriceProvider,
      quests,
      planner,
      exchange,
    );
    const server = createCompanionServer(service);
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("calculate_xp_remaining");
    expect(listed.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "search_quests",
        "get_quest",
        "get_quest_requirements",
        "get_quest_rewards",
        "get_quest_source",
        "set_quest_status",
        "set_multiple_quest_statuses",
        "list_available_quests",
        "list_missing_quest_requirements",
        "create_quest_route",
        "create_quest_shopping_list",
        "refresh_quest_data",
        "get_quest_data_status",
        "list_training_methods",
        "get_training_method",
        "compare_training_methods",
        "create_levelling_plan",
        "create_weekly_goal_plan",
        "estimate_time_to_level",
        "estimate_cost_to_level",
        "compare_quest_xp_rewards",
        "refresh_training_data",
        "get_training_data_status",
        "search_items",
        "get_item_details",
        "get_item_price_history",
        "get_item_buy_limit",
        "get_item_alchemy_value",
        "get_item_price_summary",
        "compare_item_prices",
        "value_item_list",
        "value_equipment_setup",
        "calculate_quest_shopping_cost",
        "calculate_training_cost",
        "export_price_data",
        "refresh_price_data",
        "get_price_data_status",
      ]),
    );

    const result = await client.callTool({
      name: "calculate_xp_remaining",
      arguments: { currentExperience: 1_000_000, targetLevel: 99 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        currentLevel: 73,
        targetExperience: 13_034_431,
        experienceRemaining: 12_034_431,
      },
      meta: {
        source: "deterministic RuneScape XP table",
        provenance: {
          origin: "derived",
          provider: "deterministic RuneScape XP table",
          cacheState: "not-applicable",
        },
      },
    });

    const status = await client.callTool({
      name: "get_quest_data_status",
      arguments: {},
    });
    expect(status.isError).not.toBe(true);
    expect(status.structuredContent).toMatchObject({
      data: { state: "ready", questCount: 2 },
      meta: {
        source: "local SQLite quest sync status",
        provenance: { origin: "validated-cache" },
      },
    });

    const trainingStatus = await client.callTool({
      name: "get_training_data_status",
      arguments: {},
    });
    expect(trainingStatus.isError).not.toBe(true);
    expect(trainingStatus.structuredContent).toMatchObject({
      data: { state: "ready", methodCount: 42, coveredSkills: ["mining"] },
      meta: {
        source: "local SQLite training sync status",
        provenance: { origin: "validated-cache" },
      },
    });

    const priceStatus = await client.callTool({
      name: "get_price_data_status",
      arguments: {},
    });
    expect(priceStatus.isError).not.toBe(true);
    expect(priceStatus.structuredContent).toMatchObject({
      data: { state: "ready", itemCount: 7_000, historyPointCount: 180 },
      meta: {
        source: "local SQLite Grand Exchange sync status",
        provenance: { origin: "validated-cache" },
      },
    });
  });
});
