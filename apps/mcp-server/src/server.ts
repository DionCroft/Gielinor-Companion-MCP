import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  CalculateXpRemainingToolInputSchema,
  CalculateTrainingCostToolInputSchema,
  CompareItemPricesToolInputSchema,
  CompareQuestXpRewardsToolInputSchema,
  CompareTrainingMethodsToolInputSchema,
  CreateLevellingPlanToolInputSchema,
  CreatePlayerProfileToolInputSchema,
  CreateWeeklyGoalPlanToolInputSchema,
  EmptyInputSchema,
  ExportPriceDataToolInputSchema,
  GetItemPriceToolInputSchema,
  GetPlayerStatsToolInputSchema,
  GetSkillProgressToolInputSchema,
  GetTrainingMethodToolInputSchema,
  ImportPlayerProfileToolInputSchema,
  ItemIdentifierInputSchema,
  ItemPriceHistoryToolInputSchema,
  ListTrainingMethodsToolInputSchema,
  ProfileQuestInputSchema,
  ProfileIdInputSchema,
  QuestIdentifierInputSchema,
  RefreshPriceDataToolInputSchema,
  SearchItemsToolInputSchema,
  SearchQuestsToolInputSchema,
  SetMultipleQuestStatusesToolInputSchema,
  SetQuestStatusToolInputSchema,
  UpdatePlayerPreferencesToolInputSchema,
  ValueEquipmentSetupToolInputSchema,
  ValueItemListToolInputSchema,
} from "./schemas.js";
import { publicToolError, type CompanionToolService, type ToolEnvelope } from "./tool-service.js";

function success(value: ToolEnvelope<unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: { ...value },
  };
}

async function run(operation: () => Promise<ToolEnvelope<unknown>>): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch (error) {
    const result = publicToolError(error);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: result }) }],
      isError: true,
    };
  }
}

export function createCompanionServer(tools: CompanionToolService): McpServer {
  const server = new McpServer(
    { name: "gielinor-companion-mcp", version: "0.9.0" },
    {
      instructions:
        "Use these deterministic, read-only RuneScape 3 data and planning tools. " +
        "Never imply guaranteed Grand Exchange outcomes. Profile mutations affect local companion data only.",
    },
  );

  server.registerTool(
    "create_player_profile",
    {
      description:
        "Create a local-only player profile from a public RuneScape display name. Does not fetch or request account credentials.",
      inputSchema: CreatePlayerProfileToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => run(() => tools.createPlayerProfile(input)),
  );

  server.registerTool(
    "get_player_profile",
    {
      description: "Read a locally stored player profile by its UUID.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.getPlayerProfile(profileId)),
  );

  server.registerTool(
    "list_player_profiles",
    {
      description: "List locally stored player profiles. Returns no credentials.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.listPlayerProfiles()),
  );

  server.registerTool(
    "get_player_stats",
    {
      description:
        "Read public RuneScape Hiscores for a display name, using a cache unless forceRefresh is true.",
      inputSchema: GetPlayerStatsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.getPlayerStats(input)),
  );

  server.registerTool(
    "refresh_player_stats",
    {
      description:
        "Refresh public Hiscores for a local profile and save the validated skill snapshot locally.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId }) => run(() => tools.refreshPlayerStats(profileId)),
  );

  server.registerTool(
    "update_player_preferences",
    {
      description:
        "Update optional GP budget, daily play time, or planning preference in a local profile.",
      inputSchema: UpdatePlayerPreferencesToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, ...preferences }) =>
      run(() => tools.updatePlayerPreferences(profileId, preferences)),
  );

  server.registerTool(
    "export_player_profile",
    {
      description:
        "Export a portable schema-versioned profile containing public and manually entered companion data.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.exportPlayerProfile(profileId)),
  );

  server.registerTool(
    "import_player_profile",
    {
      description: "Validate and import a schema-versioned profile into local SQLite storage.",
      inputSchema: ImportPlayerProfileToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    ({ profile }) => run(() => tools.importPlayerProfile(profile)),
  );

  server.registerTool(
    "calculate_xp_remaining",
    {
      description:
        "Deterministically calculate level, target XP, XP remaining, and progress for levels 1 through 126.",
      inputSchema: CalculateXpRemainingToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ currentExperience, targetLevel, skillId }) =>
      Promise.resolve(success(tools.calculateXpRemaining(currentExperience, targetLevel, skillId))),
  );

  server.registerTool(
    "get_skill_progress",
    {
      description:
        "Calculate progress for one skill in a refreshed local profile against a target virtual level.",
      inputSchema: GetSkillProgressToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, skillId, targetLevel }) =>
      run(() => tools.getSkillProgress(profileId, skillId, targetLevel)),
  );

  server.registerTool(
    "get_item_price",
    {
      description:
        "Get the current guide price for an RS3 item ID from Jagex ItemDB, including retrieval and cache timestamps. It is not a guaranteed trade price.",
      inputSchema: GetItemPriceToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ itemId, forceRefresh }) => run(() => tools.getItemPrice(itemId, forceRefresh ?? false)),
  );

  server.registerTool(
    "search_items",
    {
      description:
        "Search the validated local RS3 Grand Exchange catalogue by item name, alias, or ID.",
      inputSchema: SearchItemsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) => run(() => tools.searchItems(query, limit)),
  );

  server.registerTool(
    "get_item_details",
    {
      description:
        "Get current guide price, limit, alchemy values, volume, source timestamps, freshness, and explicitly unavailable fields for an item.",
      inputSchema: ItemIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ item }) => run(() => tools.getItemDetails(item)),
  );

  server.registerTool(
    "get_item_price_history",
    {
      description:
        "Get validated, ordered, chart-ready Jagex guide-price history over 24 hours to 180 days. No transaction outcome is guaranteed.",
      inputSchema: ItemPriceHistoryToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ item, range, forceRefresh }) =>
      run(() => tools.getItemPriceHistory(item, range, forceRefresh ?? false)),
  );

  server.registerTool(
    "get_item_buy_limit",
    {
      description:
        "Get the published four-hour Grand Exchange buy limit when the public source provides it.",
      inputSchema: ItemIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ item }) => run(() => tools.getItemBuyLimit(item)),
  );

  server.registerTool(
    "get_item_alchemy_value",
    {
      description:
        "Get published high- and low-alchemy values when available; this does not claim a profitable trade.",
      inputSchema: ItemIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ item }) => run(() => tools.getItemAlchemyValue(item)),
  );

  server.registerTool(
    "get_item_price_summary",
    {
      description:
        "Calculate percentage change, moving averages, daily-return volatility, historical high/low, and statistical outliers from validated history.",
      inputSchema: ItemPriceHistoryToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ item, range, forceRefresh }) =>
      run(() => tools.getItemPriceSummary(item, range, forceRefresh ?? false)),
  );

  server.registerTool(
    "compare_item_prices",
    {
      description:
        "Compare current guide prices and historical analytics for up to 20 items without making profit guarantees.",
      inputSchema: CompareItemPricesToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ items, range }) => run(() => tools.compareItemPrices(items, range)),
  );

  server.registerTool(
    "value_item_list",
    {
      description:
        "Aggregate duplicate item lines and value an inventory or shopping list with overflow protection and freshness warnings.",
      inputSchema: ValueItemListToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ items }) => run(() => tools.valueItemList(items)),
  );

  server.registerTool(
    "value_equipment_setup",
    {
      description:
        "Value a named equipment-slot setup using current validated guide prices and explicit missing-price lines.",
      inputSchema: ValueEquipmentSetupToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ items }) => run(() => tools.valueEquipmentSetup(items)),
  );

  server.registerTool(
    "calculate_quest_shopping_cost",
    {
      description:
        "Value the aggregated shopping list for a profile-aware target quest route at current guide prices.",
      inputSchema: ProfileQuestInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, quest }) => run(() => tools.calculateQuestShoppingCost(profileId, quest)),
  );

  server.registerTool(
    "calculate_training_cost",
    {
      description:
        "Return a levelling plan's published GP range and optionally reprice user-supplied consumable quantities without double-counting.",
      inputSchema: CalculateTrainingCostToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ materials, ...input }) => run(() => tools.calculateTrainingCost(input, materials)),
  );

  server.registerTool(
    "export_price_data",
    {
      description:
        "Export validated chart-ready price history for up to 20 items as returned JSON or CSV content; no arbitrary file is written.",
      inputSchema: ExportPriceDataToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) =>
      run(() =>
        tools.exportPriceData({
          ...input,
          range: input.range ?? "30d",
        }),
      ),
  );

  server.registerTool(
    "refresh_price_data",
    {
      description:
        "Validate and transactionally refresh the RS3 GE catalogue and optionally selected histories; previous valid data survives failures.",
      inputSchema: RefreshPriceDataToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ itemIds }) => run(() => tools.refreshPriceData(itemIds)),
  );

  server.registerTool(
    "get_price_data_status",
    {
      description:
        "Read catalogue/history counts, revisions, timestamps, freshness, and the last safe synchronization error.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getPriceDataStatus()),
  );

  server.registerTool(
    "search_quests",
    {
      description: "Search the validated local quest catalogue by canonical name or alias.",
      inputSchema: SearchQuestsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) => run(() => tools.searchQuests(query, limit)),
  );

  server.registerTool(
    "get_quest",
    {
      description:
        "Get one structured quest record from the last valid RuneScape Wiki synchronization.",
      inputSchema: QuestIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ quest }) => run(() => tools.getQuest(quest)),
  );

  server.registerTool(
    "get_quest_requirements",
    {
      description:
        "Get prerequisite quests, skills, items, recommendations, and manually checked requirements.",
      inputSchema: QuestIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ quest }) => run(() => tools.getQuestRequirements(quest)),
  );

  server.registerTool(
    "get_quest_rewards",
    {
      description: "Get structured quest points, experience, unlocks, and other rewards.",
      inputSchema: QuestIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ quest }) => run(() => tools.getQuestRewards(quest)),
  );

  server.registerTool(
    "get_quest_source",
    {
      description:
        "Get quest source URL, source revision, timestamps, and content hash for provenance.",
      inputSchema: QuestIdentifierInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ quest }) => run(() => tools.getQuestSource(quest)),
  );

  server.registerTool(
    "set_quest_status",
    {
      description:
        "Set completed, in-progress, or not-started status in a local companion profile only.",
      inputSchema: SetQuestStatusToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, quest, status }) => run(() => tools.setQuestStatus(profileId, quest, status)),
  );

  server.registerTool(
    "set_multiple_quest_statuses",
    {
      description: "Apply multiple validated quest-status changes to one local profile atomically.",
      inputSchema: SetMultipleQuestStatusesToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, updates }) => run(() => tools.setMultipleQuestStatuses(profileId, updates)),
  );

  server.registerTool(
    "list_available_quests",
    {
      description:
        "List quests whose known quest and skill requirements the selected local profile meets, ranked with explainable recommendations.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.listAvailableQuests(profileId)),
  );

  server.registerTool(
    "list_missing_quest_requirements",
    {
      description:
        "List missing prerequisite statuses, skills, and manually checked requirements for a target quest route.",
      inputSchema: ProfileQuestInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, quest }) => run(() => tools.listMissingQuestRequirements(profileId, quest)),
  );

  server.registerTool(
    "create_quest_route",
    {
      description:
        "Create a deterministic prerequisite-first route to a target quest, with cycle detection and alternative branches.",
      inputSchema: ProfileQuestInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, quest }) => run(() => tools.createQuestRoute(profileId, quest)),
  );

  server.registerTool(
    "create_quest_shopping_list",
    {
      description:
        "Aggregate required items across the uncompleted quests in a target quest route.",
      inputSchema: ProfileQuestInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, quest }) => run(() => tools.createQuestShoppingList(profileId, quest)),
  );

  server.registerTool(
    "refresh_quest_data",
    {
      description:
        "Fetch and validate a revision-aware RuneScape Wiki quest snapshot, then apply it transactionally. The previous valid snapshot survives failures.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    () => run(() => tools.refreshQuestData()),
  );

  server.registerTool(
    "get_quest_data_status",
    {
      description:
        "Read quest catalogue count, source revision, last successful sync, and the last safe refresh error.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getQuestDataStatus()),
  );

  server.registerTool(
    "list_training_methods",
    {
      description:
        "List revisioned training methods, optionally filtered by skill, level, membership, or Ironman compatibility.",
      inputSchema: ListTrainingMethodsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.listTrainingMethods(input)),
  );

  server.registerTool(
    "get_training_method",
    {
      description:
        "Get one structured training method with rate ranges, requirements, uncertainty, and source provenance.",
      inputSchema: GetTrainingMethodToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ methodId }) => run(() => tools.getTrainingMethod(methodId)),
  );

  server.registerTool(
    "compare_training_methods",
    {
      description:
        "Compare applicable time, GP information, access blockers, and uncertainty for training methods.",
      inputSchema: CompareTrainingMethodsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.compareTrainingMethods(input)),
  );

  server.registerTool(
    "create_levelling_plan",
    {
      description:
        "Create a deterministic multi-stage fastest, cheapest, balanced, or AFK levelling plan with budget and date checks.",
      inputSchema: CreateLevellingPlanToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.createLevellingPlan(input)),
  );

  server.registerTool(
    "create_weekly_goal_plan",
    {
      description:
        "Convert a levelling plan into weekly XP and play-time goals using local profile preferences.",
      inputSchema: CreateWeeklyGoalPlanToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.createWeeklyGoalPlan(input)),
  );

  server.registerTool(
    "estimate_time_to_level",
    {
      description:
        "Estimate an honest best/worst time range to a skill level, optionally using one specific method.",
      inputSchema: CreateLevellingPlanToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.estimateTimeToLevel(input)),
  );

  server.registerTool(
    "estimate_cost_to_level",
    {
      description:
        "Estimate cost or profit to a skill level where reliable GP data exists; otherwise return an explicit unknown.",
      inputSchema: CreateLevellingPlanToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.estimateCostToLevel(input)),
  );

  server.registerTool(
    "compare_quest_xp_rewards",
    {
      description:
        "Rank structured quest XP rewards for a skill and optionally mark rewards already completed by a local profile.",
      inputSchema: CompareQuestXpRewardsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ skillId, profileId, limit }) =>
      run(() => tools.compareQuestXpRewards(skillId, profileId, limit)),
  );

  server.registerTool(
    "refresh_training_data",
    {
      description:
        "Fetch, validate, and transactionally store revision-aware RuneScape Wiki training data while retaining the previous snapshot on failure.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    () => run(() => tools.refreshTrainingData()),
  );

  server.registerTool(
    "get_training_data_status",
    {
      description:
        "Read training method count, covered skills, source revision, last successful sync, and last safe refresh error.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getTrainingDataStatus()),
  );

  return server;
}
