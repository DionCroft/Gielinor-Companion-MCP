import type { z } from "zod";

import {
  AnalyseGeItemToolInputSchema,
  BacktestGeStrategyToolInputSchema,
  CalculateTrainingCostToolInputSchema,
  CalculateXpRemainingToolInputSchema,
  CheckForSoftwareUpdatesToolInputSchema,
  ClearExpiredQuarantineToolInputSchema,
  CompareItemPricesToolInputSchema,
  CompareQuestXpRewardsToolInputSchema,
  CompareTrainingMethodsToolInputSchema,
  CreateMarketWatchlistToolInputSchema,
  CreateLevellingPlanToolInputSchema,
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
  ListRecentErrorsToolInputSchema,
  ListGeTradesToolInputSchema,
  ListRecoveryEventsToolInputSchema,
  ListTrainingMethodsToolInputSchema,
  ProfileIdInputSchema,
  ProfileQuestInputSchema,
  QuestIdentifierInputSchema,
  RefreshPriceDataToolInputSchema,
  RefreshStaleCataloguesToolInputSchema,
  ResetProviderCircuitToolInputSchema,
  RecordGeTradeToolInputSchema,
  RecordPaperTradeToolInputSchema,
  RemoveGeTradeToolInputSchema,
  ReplacePlayerHoldingsToolInputSchema,
  RetryFailedOperationToolInputSchema,
  SearchItemsToolInputSchema,
  SearchQuestsToolInputSchema,
  ScanGeOpportunitiesToolInputSchema,
  SetOfflineModeToolInputSchema,
  SetMultipleQuestStatusesToolInputSchema,
  SetQuestStatusToolInputSchema,
  UpdatePlayerPreferencesToolInputSchema,
  UpdateGeTradeToolInputSchema,
  UpdateMarketPreferencesToolInputSchema,
  UpdateMarketWatchlistToolInputSchema,
  UpsertPlayerHoldingToolInputSchema,
  ValueEquipmentSetupToolInputSchema,
  ValueItemListToolInputSchema,
} from "./tool-schemas.js";

export type CompanionToolDefinition = {
  description: string;
  inputSchema: z.ZodTypeAny;
  effect: "read-only" | "local-state";
};

export const COMPANION_TOOL_DEFINITIONS = {
  create_player_profile: {
    description: "Create a local profile from a public RuneScape display name.",
    inputSchema: CreatePlayerProfileToolInputSchema,
    effect: "local-state",
  },
  get_player_profile: {
    description: "Read a locally stored player profile by UUID.",
    inputSchema: ProfileIdInputSchema,
    effect: "read-only",
  },
  list_player_profiles: {
    description: "List locally stored player profiles.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  get_player_stats: {
    description: "Read public RuneScape Hiscores for a display name.",
    inputSchema: GetPlayerStatsToolInputSchema,
    effect: "read-only",
  },
  refresh_player_stats: {
    description: "Refresh public Hiscores and retain the validated local snapshot.",
    inputSchema: ProfileIdInputSchema,
    effect: "local-state",
  },
  update_player_preferences: {
    description: "Update local planning preferences for a profile.",
    inputSchema: UpdatePlayerPreferencesToolInputSchema,
    effect: "local-state",
  },
  export_player_profile: {
    description: "Export a portable, schema-versioned local profile.",
    inputSchema: ProfileIdInputSchema,
    effect: "read-only",
  },
  import_player_profile: {
    description: "Validate and import a schema-versioned local profile.",
    inputSchema: ImportPlayerProfileToolInputSchema,
    effect: "local-state",
  },
  calculate_xp_remaining: {
    description: "Calculate level, target XP, XP remaining, and progress deterministically.",
    inputSchema: CalculateXpRemainingToolInputSchema,
    effect: "read-only",
  },
  get_skill_progress: {
    description: "Calculate one profile skill's progress toward a target level.",
    inputSchema: GetSkillProgressToolInputSchema,
    effect: "read-only",
  },
  get_item_price: {
    description: "Get a current Jagex guide price with source and cache timestamps.",
    inputSchema: GetItemPriceToolInputSchema,
    effect: "read-only",
  },
  search_items: {
    description: "Search the validated local Grand Exchange catalogue.",
    inputSchema: SearchItemsToolInputSchema,
    effect: "read-only",
  },
  get_item_details: {
    description: "Get guide price, limit, alchemy, volume, freshness, and provenance.",
    inputSchema: ItemIdentifierInputSchema,
    effect: "read-only",
  },
  get_item_price_history: {
    description: "Get validated, ordered, chart-ready guide-price history.",
    inputSchema: ItemPriceHistoryToolInputSchema,
    effect: "read-only",
  },
  get_item_buy_limit: {
    description: "Get the published Grand Exchange buy limit when available.",
    inputSchema: ItemIdentifierInputSchema,
    effect: "read-only",
  },
  get_item_alchemy_value: {
    description: "Get published high- and low-alchemy values when available.",
    inputSchema: ItemIdentifierInputSchema,
    effect: "read-only",
  },
  get_item_price_summary: {
    description: "Calculate changes, moving averages, volatility, and outliers.",
    inputSchema: ItemPriceHistoryToolInputSchema,
    effect: "read-only",
  },
  compare_item_prices: {
    description: "Compare sourced price analytics for up to twenty items.",
    inputSchema: CompareItemPricesToolInputSchema,
    effect: "read-only",
  },
  value_item_list: {
    description: "Aggregate and value an item list with freshness warnings.",
    inputSchema: ValueItemListToolInputSchema,
    effect: "read-only",
  },
  value_equipment_setup: {
    description: "Value a named equipment-slot setup with explicit missing data.",
    inputSchema: ValueEquipmentSetupToolInputSchema,
    effect: "read-only",
  },
  calculate_quest_shopping_cost: {
    description: "Value a profile-aware quest route's aggregated shopping list.",
    inputSchema: ProfileQuestInputSchema,
    effect: "read-only",
  },
  calculate_training_cost: {
    description: "Estimate a levelling plan's published GP range and materials.",
    inputSchema: CalculateTrainingCostToolInputSchema,
    effect: "read-only",
  },
  export_price_data: {
    description: "Return validated price history as JSON or CSV content.",
    inputSchema: ExportPriceDataToolInputSchema,
    effect: "read-only",
  },
  refresh_price_data: {
    description: "Refresh validated price data while retaining previous valid records on failure.",
    inputSchema: RefreshPriceDataToolInputSchema,
    effect: "local-state",
  },
  get_price_data_status: {
    description: "Read price-data counts, timestamps, freshness, and safe errors.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  search_quests: {
    description: "Search the validated local quest catalogue.",
    inputSchema: SearchQuestsToolInputSchema,
    effect: "read-only",
  },
  get_quest: {
    description: "Get one structured quest from the last valid snapshot.",
    inputSchema: QuestIdentifierInputSchema,
    effect: "read-only",
  },
  get_quest_requirements: {
    description: "Get a quest's skill, quest, item, and manual requirements.",
    inputSchema: QuestIdentifierInputSchema,
    effect: "read-only",
  },
  get_quest_rewards: {
    description: "Get structured quest points, XP, unlocks, and rewards.",
    inputSchema: QuestIdentifierInputSchema,
    effect: "read-only",
  },
  get_quest_source: {
    description: "Get quest source URL, revision, timestamps, and content hash.",
    inputSchema: QuestIdentifierInputSchema,
    effect: "read-only",
  },
  set_quest_status: {
    description: "Set a quest status in a local companion profile only.",
    inputSchema: SetQuestStatusToolInputSchema,
    effect: "local-state",
  },
  set_multiple_quest_statuses: {
    description: "Atomically apply validated quest-status changes to a local profile.",
    inputSchema: SetMultipleQuestStatusesToolInputSchema,
    effect: "local-state",
  },
  list_available_quests: {
    description: "List quests whose known requirements a local profile meets.",
    inputSchema: ProfileIdInputSchema,
    effect: "read-only",
  },
  list_missing_quest_requirements: {
    description: "List missing requirements for a profile-aware target quest.",
    inputSchema: ProfileQuestInputSchema,
    effect: "read-only",
  },
  create_quest_route: {
    description: "Create a deterministic prerequisite-first target quest route.",
    inputSchema: ProfileQuestInputSchema,
    effect: "read-only",
  },
  create_quest_shopping_list: {
    description: "Aggregate required items across an uncompleted quest route.",
    inputSchema: ProfileQuestInputSchema,
    effect: "read-only",
  },
  refresh_quest_data: {
    description: "Refresh revision-aware quest data transactionally.",
    inputSchema: EmptyInputSchema,
    effect: "local-state",
  },
  get_quest_data_status: {
    description: "Read quest-data count, revision, timestamps, and safe errors.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  list_training_methods: {
    description: "List structured training methods with optional filters.",
    inputSchema: ListTrainingMethodsToolInputSchema,
    effect: "read-only",
  },
  get_training_method: {
    description: "Get a sourced training method with rates and requirements.",
    inputSchema: GetTrainingMethodToolInputSchema,
    effect: "read-only",
  },
  compare_training_methods: {
    description: "Compare applicable training time, cost, access, and uncertainty.",
    inputSchema: CompareTrainingMethodsToolInputSchema,
    effect: "read-only",
  },
  create_levelling_plan: {
    description: "Create a deterministic, explainable multi-stage levelling plan.",
    inputSchema: CreateLevellingPlanToolInputSchema,
    effect: "read-only",
  },
  create_weekly_goal_plan: {
    description: "Convert a levelling plan into weekly XP and play-time goals.",
    inputSchema: CreateWeeklyGoalPlanToolInputSchema,
    effect: "read-only",
  },
  estimate_time_to_level: {
    description: "Estimate a sourced best/worst time range to a target level.",
    inputSchema: CreateLevellingPlanToolInputSchema,
    effect: "read-only",
  },
  estimate_cost_to_level: {
    description: "Estimate cost or profit where reliable training data exists.",
    inputSchema: CreateLevellingPlanToolInputSchema,
    effect: "read-only",
  },
  compare_quest_xp_rewards: {
    description: "Rank structured quest XP rewards for a skill.",
    inputSchema: CompareQuestXpRewardsToolInputSchema,
    effect: "read-only",
  },
  refresh_training_data: {
    description: "Refresh revision-aware training data transactionally.",
    inputSchema: EmptyInputSchema,
    effect: "local-state",
  },
  get_training_data_status: {
    description: "Read training-data coverage, revision, timestamps, and safe errors.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
} as const satisfies Record<string, CompanionToolDefinition>;

export type CompanionToolName = keyof typeof COMPANION_TOOL_DEFINITIONS;

export const COMPANION_TOOL_NAMES = Object.freeze(
  Object.keys(COMPANION_TOOL_DEFINITIONS) as CompanionToolName[],
);

export const COMPANION_TOOL_DEFINITIONS_V1_1_ADDITIONS = {
  get_system_health: {
    description:
      "Read the central database, provider, catalogue, scheduler, update, and recovery health snapshot.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  get_provider_health: {
    description:
      "Read provider health counters and circuit-breaker states without probing upstreams.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  get_catalogue_health: {
    description: "Read local catalogue freshness, counts, failures, and next scheduled refreshes.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  list_recent_errors: {
    description: "List recent redacted structured errors with stable codes and trace identifiers.",
    inputSchema: ListRecentErrorsToolInputSchema,
    effect: "read-only",
  },
  list_recovery_events: {
    description: "List recent bounded automatic and manual recovery attempts.",
    inputSchema: ListRecoveryEventsToolInputSchema,
    effect: "read-only",
  },
  retry_failed_operation: {
    description: "Safely retry one failed catalogue refresh through the persistent scheduler.",
    inputSchema: RetryFailedOperationToolInputSchema,
    effect: "local-state",
  },
  refresh_stale_catalogues: {
    description: "Refresh only selected catalogues that are stale, missing, or failed.",
    inputSchema: RefreshStaleCataloguesToolInputSchema,
    effect: "local-state",
  },
  run_database_integrity_check: {
    description: "Run SQLite's read-only quick integrity check and return structured health.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  export_redacted_diagnostics: {
    description:
      "Export system health, safe configuration, error codes, and recovery history with sensitive data removed.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  check_for_software_updates: {
    description:
      "Read validated GitHub Releases metadata and report updates without downloading or installing code.",
    inputSchema: CheckForSoftwareUpdatesToolInputSchema,
    effect: "read-only",
  },
  clear_expired_quarantine_records: {
    description:
      "Delete only expired invalid-cache quarantine records while preserving active and retained records.",
    inputSchema: ClearExpiredQuarantineToolInputSchema,
    effect: "local-state",
  },
  reset_provider_circuit: {
    description:
      "Reset one provider capability circuit after explicit confirmation so a bounded probe can run.",
    inputSchema: ResetProviderCircuitToolInputSchema,
    effect: "local-state",
  },
  get_selected_player_snapshot: {
    description:
      "Read the explicitly selected local profile together with its latest holdings and market preferences.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  set_selected_player_profile: {
    description: "Persist the selected local player profile used by user-aware planning.",
    inputSchema: ProfileIdInputSchema,
    effect: "local-state",
  },
  get_player_holdings: {
    description: "Read the latest user-controlled local holdings snapshot for one profile.",
    inputSchema: ProfileIdInputSchema,
    effect: "read-only",
  },
  replace_player_holdings: {
    description:
      "Replace local holdings by writing a new versioned snapshot after explicit confirmation.",
    inputSchema: ReplacePlayerHoldingsToolInputSchema,
    effect: "local-state",
  },
  upsert_player_holding: {
    description: "Add or update one user-entered holding in a new local snapshot.",
    inputSchema: UpsertPlayerHoldingToolInputSchema,
    effect: "local-state",
  },
  import_player_holdings: {
    description: "Validate and import bounded CSV or JSON holdings after explicit confirmation.",
    inputSchema: ImportPlayerHoldingsToolInputSchema,
    effect: "local-state",
  },
  export_player_holdings: {
    description: "Export the latest local holdings snapshot as returned CSV or JSON content.",
    inputSchema: ExportPlayerHoldingsToolInputSchema,
    effect: "read-only",
  },
  record_ge_trade: {
    description: "Record one manually confirmed Grand Exchange trade in the local journal.",
    inputSchema: RecordGeTradeToolInputSchema,
    effect: "local-state",
  },
  list_ge_trades: {
    description: "List the selected profile's private local Grand Exchange trade journal.",
    inputSchema: ListGeTradesToolInputSchema,
    effect: "read-only",
  },
  update_ge_trade: {
    description: "Update one local Grand Exchange trade-journal record.",
    inputSchema: UpdateGeTradeToolInputSchema,
    effect: "local-state",
  },
  remove_ge_trade: {
    description: "Remove one local trade-journal record after explicit confirmation.",
    inputSchema: RemoveGeTradeToolInputSchema,
    effect: "local-state",
  },
  get_market_preferences: {
    description: "Read versioned local risk, strategy, allocation and data-confidence preferences.",
    inputSchema: ProfileIdInputSchema,
    effect: "read-only",
  },
  update_market_preferences: {
    description: "Update versioned local market-analysis preferences for one profile.",
    inputSchema: UpdateMarketPreferencesToolInputSchema,
    effect: "local-state",
  },
  create_market_watchlist: {
    description: "Create a private local item watchlist for one profile.",
    inputSchema: CreateMarketWatchlistToolInputSchema,
    effect: "local-state",
  },
  update_market_watchlist: {
    description: "Update a private local watchlist's name or item IDs.",
    inputSchema: UpdateMarketWatchlistToolInputSchema,
    effect: "local-state",
  },
  get_market_watchlist: {
    description: "Get one local market watchlist or list all watchlists for a profile.",
    inputSchema: GetMarketWatchlistToolInputSchema,
    effect: "read-only",
  },
  analyse_ge_item: {
    description:
      "Calculate a deterministic, confidence-scored manual RS3 market signal with full evidence.",
    inputSchema: AnalyseGeItemToolInputSchema,
    effect: "read-only",
  },
  scan_ge_opportunities: {
    description: "Rank a bounded explicit item set using versioned deterministic market rules.",
    inputSchema: ScanGeOpportunitiesToolInputSchema,
    effect: "read-only",
  },
  get_ge_buy_candidates: {
    description: "Return only buy candidates from a deterministic bounded market scan.",
    inputSchema: ScanGeOpportunitiesToolInputSchema,
    effect: "read-only",
  },
  get_ge_sell_candidates: {
    description: "Return sell/reduce candidates only when the profile records holdings.",
    inputSchema: ScanGeOpportunitiesToolInputSchema,
    effect: "read-only",
  },
  create_manual_ge_order_plan: {
    description:
      "Create a non-executing order plan capped by local cash, allocation, risk and buy limit.",
    inputSchema: AnalyseGeItemToolInputSchema,
    effect: "read-only",
  },
  explain_ge_recommendation: {
    description:
      "Return the deterministic component scores, reasons, warnings and provenance for one signal.",
    inputSchema: AnalyseGeItemToolInputSchema,
    effect: "read-only",
  },
  backtest_ge_strategy: {
    description:
      "Run a chronological, delayed-fill, slippage-aware historical guide-price backtest.",
    inputSchema: BacktestGeStrategyToolInputSchema,
    effect: "read-only",
  },
  get_portfolio_summary: {
    description:
      "Calculate local holdings guide value, cost basis, gains and concentration exposure.",
    inputSchema: ProfileIdInputSchema,
    effect: "read-only",
  },
  get_real_data_status: {
    description:
      "Read native runtime, offline enforcement, selected profile and catalogue truth states.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  refresh_all_real_data: {
    description:
      "Run an isolated staged refresh across selected Hiscores and all public catalogues.",
    inputSchema: EmptyInputSchema,
    effect: "local-state",
  },
  get_market_data_status: {
    description:
      "Read local GE catalogue/history counts, source revision, freshness and offline state.",
    inputSchema: EmptyInputSchema,
    effect: "read-only",
  },
  refresh_market_data: {
    description: "Transactionally refresh the public RS3 GE catalogue and optional item histories.",
    inputSchema: RefreshPriceDataToolInputSchema,
    effect: "local-state",
  },
  get_provider_disagreements: {
    description: "Identify material Weird Gloop RS3-history versus Jagex ItemDB-graph differences.",
    inputSchema: ScanGeOpportunitiesToolInputSchema,
    effect: "read-only",
  },
  set_offline_mode: {
    description:
      "Persist backend-enforced offline mode so provider and scheduler network calls stop.",
    inputSchema: SetOfflineModeToolInputSchema,
    effect: "local-state",
  },
  get_paper_portfolio: {
    description: "Read a private hypothetical portfolio that never affects RuneScape or real GP.",
    inputSchema: GetPaperPortfolioToolInputSchema,
    effect: "read-only",
  },
  record_paper_trade: {
    description:
      "Record a validated hypothetical trade with simulated cash and holding constraints.",
    inputSchema: RecordPaperTradeToolInputSchema,
    effect: "local-state",
  },
  create_account_aware_quest_shopping_list: {
    description:
      "Aggregate required quest items and optionally subtract the selected profile's confirmed local holdings.",
    inputSchema: CreateQuestShoppingListToolInputSchema,
    effect: "read-only",
  },
} as const satisfies Record<string, CompanionToolDefinition>;

export const CURRENT_COMPANION_TOOL_DEFINITIONS = {
  ...COMPANION_TOOL_DEFINITIONS,
  ...COMPANION_TOOL_DEFINITIONS_V1_1_ADDITIONS,
} as const satisfies Record<string, CompanionToolDefinition>;

export type CurrentCompanionToolName = keyof typeof CURRENT_COMPANION_TOOL_DEFINITIONS;

export const CURRENT_COMPANION_TOOL_NAMES = Object.freeze(
  Object.keys(CURRENT_COMPANION_TOOL_DEFINITIONS) as CurrentCompanionToolName[],
);

export function isCompanionToolName(value: string): value is CompanionToolName {
  return Object.hasOwn(COMPANION_TOOL_DEFINITIONS, value);
}

export function isCurrentCompanionToolName(value: string): value is CurrentCompanionToolName {
  return Object.hasOwn(CURRENT_COMPANION_TOOL_DEFINITIONS, value);
}
