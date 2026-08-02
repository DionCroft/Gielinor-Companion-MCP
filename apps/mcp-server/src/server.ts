import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  AnalyseGeItemToolInputSchema,
  BacktestGeStrategyToolInputSchema,
  CalculateXpRemainingToolInputSchema,
  CalculateTrainingCostToolInputSchema,
  CheckForSoftwareUpdatesToolInputSchema,
  ClearExpiredQuarantineToolInputSchema,
  CompareItemPricesToolInputSchema,
  CompareQuestXpRewardsToolInputSchema,
  CompareTrainingMethodsToolInputSchema,
  CreateLevellingPlanToolInputSchema,
  CreateMarketWatchlistToolInputSchema,
  CreatePlayerProfileToolInputSchema,
  CreateQuestShoppingListToolInputSchema,
  CreateWeeklyGoalPlanToolInputSchema,
  EmptyInputSchema,
  ExportPriceDataToolInputSchema,
  ExportPlayerHoldingsToolInputSchema,
  GetItemPriceToolInputSchema,
  GetMarketWatchlistToolInputSchema,
  GetPaperPortfolioToolInputSchema,
  GetPlayerStatsToolInputSchema,
  GetSkillProgressToolInputSchema,
  GetTrainingMethodToolInputSchema,
  ImportPlayerProfileToolInputSchema,
  ImportPlayerHoldingsToolInputSchema,
  ItemIdentifierInputSchema,
  ItemPriceHistoryToolInputSchema,
  ListTrainingMethodsToolInputSchema,
  ListGeTradesToolInputSchema,
  ListRecentErrorsToolInputSchema,
  ListRecoveryEventsToolInputSchema,
  ProfileQuestInputSchema,
  ProfileIdInputSchema,
  QuestIdentifierInputSchema,
  RefreshPriceDataToolInputSchema,
  RefreshStaleCataloguesToolInputSchema,
  RecordGeTradeToolInputSchema,
  RecordPaperTradeToolInputSchema,
  RemoveGeTradeToolInputSchema,
  ReplacePlayerHoldingsToolInputSchema,
  ResetProviderCircuitToolInputSchema,
  RetryFailedOperationToolInputSchema,
  SearchItemsToolInputSchema,
  ScanGeOpportunitiesToolInputSchema,
  SetOfflineModeToolInputSchema,
  SearchQuestsToolInputSchema,
  SetMultipleQuestStatusesToolInputSchema,
  SetQuestStatusToolInputSchema,
  UpdatePlayerPreferencesToolInputSchema,
  UpdateGeTradeToolInputSchema,
  UpdateMarketPreferencesToolInputSchema,
  UpdateMarketWatchlistToolInputSchema,
  UpsertPlayerHoldingToolInputSchema,
  ValueEquipmentSetupToolInputSchema,
  ValueItemListToolInputSchema,
} from "./schemas.js";
import type { GielinorError } from "@gielinor/shared-types";
import { APPLICATION_VERSION } from "@gielinor/shared-types";

import { publicToolError, type CompanionToolService, type ToolEnvelope } from "./tool-service.js";

function success(value: ToolEnvelope<unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: { ...value },
  };
}

async function runTool(
  operation: () => Promise<ToolEnvelope<unknown>>,
  recordError?: ((error: GielinorError) => void | Promise<void>) | undefined,
): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch (error) {
    const result = publicToolError(error);
    try {
      await recordError?.(result);
    } catch {
      // Diagnostics persistence cannot replace the original public tool error.
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ error: result }) }],
      isError: true,
    };
  }
}

export type CompanionServerOptions = {
  recordError?: ((error: GielinorError) => void | Promise<void>) | undefined;
};

export function createCompanionServer(
  tools: CompanionToolService,
  options: CompanionServerOptions = {},
): McpServer {
  const run = (operation: () => Promise<ToolEnvelope<unknown>>): Promise<CallToolResult> =>
    runTool(operation, options.recordError);
  const server = new McpServer(
    { name: "gielinor-companion-mcp", version: APPLICATION_VERSION },
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

  server.registerTool(
    "get_system_health",
    {
      description:
        "Read central database, provider, catalogue, scheduler, update, and recovery health without probing upstream providers.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getSystemHealth()),
  );

  server.registerTool(
    "get_provider_health",
    {
      description:
        "Read provider success/failure counters and circuit-breaker state without making network requests.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getProviderHealth()),
  );

  server.registerTool(
    "get_catalogue_health",
    {
      description:
        "Read local quest, training, and price catalogue freshness, counts, failures, and next refresh times.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getCatalogueHealth()),
  );

  server.registerTool(
    "list_recent_errors",
    {
      description:
        "List recent redacted structured diagnostics errors with stable codes and trace identifiers.",
      inputSchema: ListRecentErrorsToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ limit, activeOnly }) => run(() => tools.listRecentErrors(limit, activeOnly)),
  );

  server.registerTool(
    "list_recovery_events",
    {
      description: "List recent bounded automatic and manual recovery attempts.",
      inputSchema: ListRecoveryEventsToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ limit }) => run(() => tools.listRecoveryEvents(limit)),
  );

  server.registerTool(
    "retry_failed_operation",
    {
      description:
        "Safely retry one catalogue refresh through the persistent scheduler; no destructive repair is exposed.",
      inputSchema: RetryFailedOperationToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ operation }) => run(() => tools.retryFailedOperation(operation)),
  );

  server.registerTool(
    "refresh_stale_catalogues",
    {
      description:
        "Refresh only selected catalogues that are stale, missing, or failed while retaining prior valid snapshots.",
      inputSchema: RefreshStaleCataloguesToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ catalogues }) => run(() => tools.refreshStaleCatalogues(catalogues)),
  );

  server.registerTool(
    "run_database_integrity_check",
    {
      description:
        "Run SQLite's read-only quick integrity check; this tool never repairs, resets, or deletes data.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.runDatabaseIntegrityCheck()),
  );

  server.registerTool(
    "export_redacted_diagnostics",
    {
      description:
        "Export health, safe configuration, error codes, and recovery history without profiles, secrets, payloads, or absolute paths.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.exportRedactedDiagnostics()),
  );

  server.registerTool(
    "check_for_software_updates",
    {
      description:
        "Read validated GitHub Releases metadata and compare semantic versions without downloading or installing code.",
      inputSchema: CheckForSoftwareUpdatesToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.checkForSoftwareUpdates(input)),
  );

  server.registerTool(
    "clear_expired_quarantine_records",
    {
      description:
        "Delete only invalid cache quarantine records older than a bounded retention period; active cache and player data are never touched.",
      inputSchema: ClearExpiredQuarantineToolInputSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ retentionDays }) => run(() => tools.clearExpiredQuarantineRecords(retentionDays)),
  );

  server.registerTool(
    "reset_provider_circuit",
    {
      description:
        "Reset one provider capability circuit after explicit confirmation; this permits only the provider's normal bounded probe behaviour.",
      inputSchema: ResetProviderCircuitToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ providerId, capability }) => run(() => tools.resetProviderCircuit(providerId, capability)),
  );

  server.registerTool(
    "get_selected_player_snapshot",
    {
      description:
        "Read the explicitly selected local profile, its latest user-entered holdings, and market preferences.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getSelectedPlayerSnapshot()),
  );

  server.registerTool(
    "set_selected_player_profile",
    {
      description: "Persist the local profile used by user-aware planning and market analysis.",
      inputSchema: ProfileIdInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId }) => run(() => tools.setSelectedPlayerProfile(profileId)),
  );

  server.registerTool(
    "get_player_holdings",
    {
      description:
        "Read the latest private local holdings snapshot. Public RuneScape APIs are not presented as bank or inventory access.",
      inputSchema: ProfileIdInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.getPlayerHoldings(profileId)),
  );

  server.registerTool(
    "replace_player_holdings",
    {
      description:
        "Write a new versioned local holdings snapshot after explicit confirmation; earlier snapshots remain retained.",
      inputSchema: ReplacePlayerHoldingsToolInputSchema,
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (input) => run(() => tools.replacePlayerHoldings(input)),
  );

  server.registerTool(
    "upsert_player_holding",
    {
      description: "Add or update one user-entered holding in a new local snapshot.",
      inputSchema: UpsertPlayerHoldingToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    (input) => run(() => tools.upsertPlayerHolding(input)),
  );

  server.registerTool(
    "import_player_holdings",
    {
      description:
        "Validate bounded CSV or JSON content and write a new local holdings snapshot after explicit confirmation.",
      inputSchema: ImportPlayerHoldingsToolInputSchema,
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (input) => run(() => tools.importPlayerHoldings(input)),
  );

  server.registerTool(
    "export_player_holdings",
    {
      description: "Return the latest user-entered holdings as CSV or JSON without writing a file.",
      inputSchema: ExportPlayerHoldingsToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, format }) => run(() => tools.exportPlayerHoldings(profileId, format)),
  );

  server.registerTool(
    "record_ge_trade",
    {
      description:
        "Record one user-entered or user-confirmed Grand Exchange trade locally; no offer is placed.",
      inputSchema: RecordGeTradeToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => run(() => tools.recordGeTrade(input)),
  );

  server.registerTool(
    "list_ge_trades",
    {
      description: "List one profile's private local Grand Exchange trade journal.",
      inputSchema: ListGeTradesToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.listGeTrades(profileId)),
  );

  server.registerTool(
    "update_ge_trade",
    {
      description: "Update one local trade-journal record; no RuneScape offer is changed.",
      inputSchema: UpdateGeTradeToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, tradeId, ...updates }) =>
      run(() => tools.updateGeTrade(profileId, tradeId, updates)),
  );

  server.registerTool(
    "remove_ge_trade",
    {
      description: "Remove one local journal record after explicit confirmation.",
      inputSchema: RemoveGeTradeToolInputSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ profileId, tradeId }) => run(() => tools.removeGeTrade(profileId, tradeId)),
  );

  server.registerTool(
    "get_market_preferences",
    {
      description: "Read versioned private risk, strategy, allocation and confidence preferences.",
      inputSchema: ProfileIdInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.getMarketPreferences(profileId)),
  );

  server.registerTool(
    "update_market_preferences",
    {
      description: "Update versioned local market-analysis preferences for one profile.",
      inputSchema: UpdateMarketPreferencesToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, ...updates }) => run(() => tools.updateMarketPreferences(profileId, updates)),
  );

  server.registerTool(
    "create_market_watchlist",
    {
      description: "Create a private local item watchlist; no market offer is placed.",
      inputSchema: CreateMarketWatchlistToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => run(() => tools.createMarketWatchlist(input)),
  );

  server.registerTool(
    "update_market_watchlist",
    {
      description: "Update one private local market watchlist.",
      inputSchema: UpdateMarketWatchlistToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, watchlistId, ...updates }) =>
      run(() => tools.updateMarketWatchlist(profileId, watchlistId, updates)),
  );

  server.registerTool(
    "get_market_watchlist",
    {
      description: "Get one private local watchlist or list all watchlists for a profile.",
      inputSchema: GetMarketWatchlistToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, watchlistId }) => run(() => tools.getMarketWatchlist(profileId, watchlistId)),
  );

  server.registerTool(
    "analyse_ge_item",
    {
      description:
        "Calculate a deterministic RS3 guide-price signal with inspectable scores, evidence, freshness and warnings.",
      inputSchema: AnalyseGeItemToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, item, forceRefresh }) =>
      run(() => tools.analyseGeItem(profileId, item, forceRefresh)),
  );

  server.registerTool(
    "scan_ge_opportunities",
    {
      description:
        "Rank an explicit bounded item set using the same versioned deterministic scoring model.",
      inputSchema: ScanGeOpportunitiesToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, items, forceRefresh }) =>
      run(() => tools.scanGeOpportunities(profileId, items, forceRefresh)),
  );

  server.registerTool(
    "get_ge_buy_candidates",
    {
      description:
        "Return only strong-buy-candidate and buy-candidate signals; no offer is placed.",
      inputSchema: ScanGeOpportunitiesToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, items, forceRefresh }) =>
      run(() => tools.getGeBuyCandidates(profileId, items, forceRefresh)),
  );

  server.registerTool(
    "get_ge_sell_candidates",
    {
      description:
        "Return sell/reduce signals only for items present in confirmed local holdings; no offer is changed.",
      inputSchema: ScanGeOpportunitiesToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, items, forceRefresh }) =>
      run(() => tools.getGeSellCandidates(profileId, items, forceRefresh)),
  );

  server.registerTool(
    "create_manual_ge_order_plan",
    {
      description:
        "Create a non-executing plan with statistical zones and cash/allocation/risk/buy-limit sizing.",
      inputSchema: AnalyseGeItemToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, item, forceRefresh }) =>
      run(() => tools.createManualGeOrderPlan(profileId, item, forceRefresh)),
  );

  server.registerTool(
    "explain_ge_recommendation",
    {
      description:
        "Return the complete deterministic analysis whose component reasons explain the recommendation.",
      inputSchema: AnalyseGeItemToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, item, forceRefresh }) =>
      run(() => tools.analyseGeItem(profileId, item, forceRefresh)),
  );

  server.registerTool(
    "backtest_ge_strategy",
    {
      description:
        "Run a no-look-ahead chronological guide-price backtest with delayed fills, slippage and buy limits.",
      inputSchema: BacktestGeStrategyToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ itemId, forceRefresh, ...input }) =>
      run(() => tools.backtestGeStrategy(itemId, input, forceRefresh)),
  );

  server.registerTool(
    "get_portfolio_summary",
    {
      description:
        "Calculate private local portfolio guide value, known basis, realised journal gain/loss and exposure.",
      inputSchema: ProfileIdInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.getPortfolioSummary(profileId)),
  );

  server.registerTool(
    "get_real_data_status",
    {
      description:
        "Read the truthful native runtime, backend offline state, selected profile and every real catalogue status.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getRealDataStatus()),
  );

  server.registerTool(
    "refresh_all_real_data",
    {
      description:
        "Run isolated stages for selected-profile Hiscores, quests, training and GE data; valid stages survive other failures.",
      inputSchema: EmptyInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    () => run(() => tools.refreshAllRealData()),
  );

  server.registerTool(
    "get_market_data_status",
    {
      description:
        "Read local RS3 GE catalogue and price-history status, timestamps, counts and offline state.",
      inputSchema: EmptyInputSchema,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getMarketDataStatus()),
  );

  server.registerTool(
    "refresh_market_data",
    {
      description:
        "Transactionally refresh the RS3 GE catalogue and optional item histories; unavailable in offline mode.",
      inputSchema: RefreshPriceDataToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ itemIds }) => run(() => tools.refreshMarketData(itemIds)),
  );

  server.registerTool(
    "get_provider_disagreements",
    {
      description:
        "List material differences between Weird Gloop RS3 history and the independent Jagex ItemDB graph for explicit items.",
      inputSchema: ScanGeOpportunitiesToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, items, forceRefresh }) =>
      run(() => tools.getProviderDisagreements(profileId, items, forceRefresh)),
  );

  server.registerTool(
    "set_offline_mode",
    {
      description:
        "Persist backend-enforced offline mode; enabling it stops provider, update and scheduler network calls.",
      inputSchema: SetOfflineModeToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ offline }) => run(() => tools.setOfflineMode(offline)),
  );

  server.registerTool(
    "get_paper_portfolio",
    {
      description:
        "Read a private hypothetical portfolio with simulated cash, holdings and trades.",
      inputSchema: GetPaperPortfolioToolInputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, initialCashGp }) => run(() => tools.getPaperPortfolio(profileId, initialCashGp)),
  );

  server.registerTool(
    "record_paper_trade",
    {
      description:
        "Record a hypothetical buy or sell constrained by simulated cash/holdings; no RuneScape offer is placed.",
      inputSchema: RecordPaperTradeToolInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => run(() => tools.recordPaperTrade(input)),
  );

  server.registerTool(
    "create_account_aware_quest_shopping_list",
    {
      description:
        "Aggregate required quest items and optionally subtract the selected profile's confirmed user-entered holdings.",
      inputSchema: CreateQuestShoppingListToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, quest, subtractOwned }) =>
      run(() => tools.createQuestShoppingList(profileId, quest, subtractOwned)),
  );

  return server;
}
