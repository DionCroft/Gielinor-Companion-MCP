import {
  CompanionError,
  NotFoundError,
  calculateSkillProgress,
  type EquipmentValuationRequestLine,
  type ExportPriceDataInput,
  type GrandExchangeService,
  type ItemReference,
  type LevellingPlanInput,
  type LevellingPlannerService,
  type MarketIntelligenceService,
  type PlayerPrivateDataService,
  type PriceProvider,
  type ProfileService,
  type QuestService,
  type ValuationRequestLine,
} from "@gielinor/core";
import {
  createGielinorError,
  createTraceId,
  toGielinorError,
  type CatalogueHealth,
  type ComponentHealth,
  type GameMode,
  type GielinorError,
  type MaintenanceJobName,
  type MarketPreferences,
  type MarketBacktestInput,
  type PlayerHolding,
  type PlayerPrivateDataSource,
  type ProviderDiagnosticHealth,
  type ProfileExport,
  type QuestStatus,
  type RecoveryEvent,
  type RecoveryStatus,
  type SkillId,
  type SoftwareUpdateCheck,
  type SystemHealth,
  type RedactedDiagnostics,
} from "@gielinor/shared-types";
import type { MaintenanceRunResult } from "@gielinor/database";

import { ToolEnvelopeSchema } from "./schemas.js";

export type ToolEnvelope<T> = {
  data: T;
  meta: {
    generatedAt: string;
    source: string;
    traceId?: string;
    recoveryStatus?: RecoveryStatus;
  };
};

export type ToolError = GielinorError;

function envelope<T>(data: T, source: string): ToolEnvelope<T> {
  return ToolEnvelopeSchema.parse({
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source,
    },
  }) as ToolEnvelope<T>;
}

function diagnosticEnvelope<T>(
  data: T,
  source: string,
  recoveryStatus: RecoveryStatus,
  traceId = createTraceId(),
): ToolEnvelope<T> {
  return ToolEnvelopeSchema.parse({
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source,
      traceId,
      recoveryStatus,
    },
  }) as ToolEnvelope<T>;
}

export type DiagnosticsToolBackend = {
  getSystemHealth(): Promise<SystemHealth>;
  getProviderHealth(): ProviderDiagnosticHealth[];
  getCatalogueHealth(): Promise<CatalogueHealth[]>;
  listRecentErrors(limit?: number, activeOnly?: boolean): GielinorError[];
  listRecoveryEvents(limit?: number): RecoveryEvent[];
  retryFailedOperation(
    operation: Exclude<MaintenanceJobName, "software-update-check">,
  ): Promise<MaintenanceRunResult>;
  refreshStaleCatalogues(catalogues?: Array<"quests" | "training" | "prices">): Promise<{
    results: MaintenanceRunResult[];
    refreshed: Array<"quests" | "training" | "prices">;
    alreadyFresh: Array<"quests" | "training" | "prices">;
  }>;
  runDatabaseIntegrityCheck(): ComponentHealth;
  exportRedactedDiagnostics(): Promise<RedactedDiagnostics>;
  checkForSoftwareUpdates(options?: {
    includePrereleases?: boolean | undefined;
    forceRefresh?: boolean | undefined;
  }): Promise<SoftwareUpdateCheck>;
  clearExpiredQuarantineRecords(retentionDays?: number): Promise<{
    deleted: number;
    cutoffAt: string;
    retentionDays: number;
  }>;
  resetProviderCircuit(
    providerId: string,
    capability: string,
  ): {
    providerId: string;
    capability: string;
    resetCount: number;
    state: "closed";
  };
};

export function publicToolError(error: unknown): ToolError {
  if (!(error instanceof CompanionError)) {
    return createGielinorError("GC-MCP-003", {
      message: "The request could not be completed",
      userMessage: "The request could not be completed",
      source: "mcp-server",
      operation: "tool-execution",
    });
  }
  return toGielinorError(error, {
    source: "mcp-server",
    operation: "tool-execution",
  });
}

export class CompanionToolService {
  public constructor(
    private readonly profiles: ProfileService,
    private readonly prices: PriceProvider,
    private readonly quests?: QuestService,
    private readonly planner?: LevellingPlannerService,
    private readonly exchange?: GrandExchangeService,
    private readonly diagnostics?: DiagnosticsToolBackend,
    private readonly playerPrivateData?: PlayerPrivateDataService,
    private readonly marketIntelligence?: MarketIntelligenceService,
  ) {}

  private questService(): QuestService {
    if (this.quests === undefined) {
      throw new CompanionError("Quest companion is not configured", "UNSUPPORTED_FEATURE");
    }
    return this.quests;
  }

  private plannerService(): LevellingPlannerService {
    if (this.planner === undefined) {
      throw new CompanionError("Levelling planner is not configured", "UNSUPPORTED_FEATURE");
    }
    return this.planner;
  }

  private exchangeService(): GrandExchangeService {
    if (this.exchange === undefined) {
      throw new CompanionError(
        "Grand Exchange intelligence is not configured",
        "UNSUPPORTED_FEATURE",
      );
    }
    return this.exchange;
  }

  private diagnosticsService(): DiagnosticsToolBackend {
    if (this.diagnostics === undefined) {
      throw new CompanionError("Diagnostics are not configured", "UNSUPPORTED_FEATURE");
    }
    return this.diagnostics;
  }

  private privateDataService(): PlayerPrivateDataService {
    if (this.playerPrivateData === undefined) {
      throw new CompanionError("Player-private data is not configured", "UNSUPPORTED_FEATURE");
    }
    return this.playerPrivateData;
  }

  private marketIntelligenceService(): MarketIntelligenceService {
    if (this.marketIntelligence === undefined) {
      throw new CompanionError(
        "Deterministic market intelligence is not configured",
        "UNSUPPORTED_FEATURE",
      );
    }
    return this.marketIntelligence;
  }

  public async getSystemHealth(): Promise<ToolEnvelope<SystemHealth>> {
    return diagnosticEnvelope(
      await this.diagnosticsService().getSystemHealth(),
      "central local health service",
      "not-required",
    );
  }

  public async getProviderHealth(): Promise<ToolEnvelope<ProviderDiagnosticHealth[]>> {
    return diagnosticEnvelope(
      this.diagnosticsService().getProviderHealth(),
      "provider health and circuit-breaker registry",
      "not-required",
    );
  }

  public async getCatalogueHealth(): Promise<ToolEnvelope<CatalogueHealth[]>> {
    return diagnosticEnvelope(
      await this.diagnosticsService().getCatalogueHealth(),
      "validated local catalogue status",
      "not-required",
    );
  }

  public async listRecentErrors(
    limit = 50,
    activeOnly = false,
  ): Promise<ToolEnvelope<GielinorError[]>> {
    return diagnosticEnvelope(
      this.diagnosticsService().listRecentErrors(limit, activeOnly),
      "redacted local diagnostics history",
      "not-required",
    );
  }

  public async listRecoveryEvents(limit = 50): Promise<ToolEnvelope<RecoveryEvent[]>> {
    return diagnosticEnvelope(
      this.diagnosticsService().listRecoveryEvents(limit),
      "local recovery history",
      "not-required",
    );
  }

  public async retryFailedOperation(
    operation: "quest-refresh" | "training-refresh" | "price-refresh",
  ): Promise<ToolEnvelope<MaintenanceRunResult>> {
    const result = await this.diagnosticsService().retryFailedOperation(operation);
    return diagnosticEnvelope(
      result,
      "persistent maintenance scheduler",
      result.status === "success"
        ? "succeeded"
        : result.status === "failed"
          ? "failed"
          : "not-attempted",
    );
  }

  public async refreshStaleCatalogues(
    catalogues?: Array<"quests" | "training" | "prices">,
  ): Promise<
    ToolEnvelope<{
      results: MaintenanceRunResult[];
      refreshed: Array<"quests" | "training" | "prices">;
      alreadyFresh: Array<"quests" | "training" | "prices">;
    }>
  > {
    const result = await this.diagnosticsService().refreshStaleCatalogues(catalogues);
    const successes = result.results.filter((entry) => entry.status === "success").length;
    const failures = result.results.filter((entry) => entry.status === "failed").length;
    return diagnosticEnvelope(
      result,
      "persistent maintenance scheduler",
      result.results.length === 0
        ? "not-required"
        : failures === 0
          ? "succeeded"
          : successes > 0
            ? "partial"
            : "failed",
    );
  }

  public async runDatabaseIntegrityCheck(): Promise<ToolEnvelope<ComponentHealth>> {
    const result = this.diagnosticsService().runDatabaseIntegrityCheck();
    return diagnosticEnvelope(
      result,
      "read-only SQLite quick integrity check",
      result.state === "healthy" ? "not-required" : "failed",
    );
  }

  public async exportRedactedDiagnostics(): Promise<ToolEnvelope<RedactedDiagnostics>> {
    return diagnosticEnvelope(
      await this.diagnosticsService().exportRedactedDiagnostics(),
      "redacted local diagnostics export",
      "not-required",
    );
  }

  public async checkForSoftwareUpdates(input: {
    includePrereleases?: boolean | undefined;
    forceRefresh?: boolean | undefined;
  }): Promise<ToolEnvelope<SoftwareUpdateCheck>> {
    const result = await this.diagnosticsService().checkForSoftwareUpdates(input);
    return diagnosticEnvelope(
      result,
      "read-only GitHub Releases metadata",
      "not-required",
      result.traceId,
    );
  }

  public async clearExpiredQuarantineRecords(retentionDays?: number): Promise<
    ToolEnvelope<{
      deleted: number;
      cutoffAt: string;
      retentionDays: number;
    }>
  > {
    return diagnosticEnvelope(
      await this.diagnosticsService().clearExpiredQuarantineRecords(retentionDays),
      "expired local cache quarantine records",
      "succeeded",
    );
  }

  public async resetProviderCircuit(
    providerId: string,
    capability: string,
  ): Promise<
    ToolEnvelope<{
      providerId: string;
      capability: string;
      resetCount: number;
      state: "closed";
    }>
  > {
    return diagnosticEnvelope(
      this.diagnosticsService().resetProviderCircuit(providerId, capability),
      "provider circuit-breaker registry",
      "succeeded",
    );
  }

  public async createPlayerProfile(input: {
    displayName: string;
    gameMode?: GameMode | undefined;
    availableGp?: number | undefined;
    preferredPlayStyle?: "fastest" | "cheapest" | "balanced" | "afk" | undefined;
    availableHoursPerDay?: number | undefined;
  }): Promise<ToolEnvelope<Awaited<ReturnType<ProfileService["create"]>>>> {
    return envelope(await this.profiles.create(input), "local SQLite profile");
  }

  public async getPlayerProfile(
    profileId: string,
  ): Promise<ToolEnvelope<Awaited<ReturnType<ProfileService["get"]>>>> {
    return envelope(await this.profiles.get(profileId), "local SQLite profile");
  }

  public async listPlayerProfiles(): Promise<
    ToolEnvelope<Awaited<ReturnType<ProfileService["list"]>>>
  > {
    return envelope(await this.profiles.list(), "local SQLite profiles");
  }

  public async getPlayerStats(input: {
    displayName: string;
    gameMode?: GameMode | undefined;
    forceRefresh?: boolean | undefined;
  }): Promise<ToolEnvelope<Awaited<ReturnType<ProfileService["getPublicStats"]>>>> {
    const result = await this.profiles.getPublicStats(
      input.displayName,
      input.gameMode ?? "normal",
      input.forceRefresh ?? false,
    );
    return envelope(result, result.source.name);
  }

  public async refreshPlayerStats(
    profileId: string,
  ): Promise<ToolEnvelope<Awaited<ReturnType<ProfileService["refreshStats"]>>>> {
    return envelope(
      await this.profiles.refreshStats(profileId),
      "Jagex public Hiscores and local SQLite profile",
    );
  }

  public async updatePlayerPreferences(
    profileId: string,
    input: {
      availableGp?: number | undefined;
      preferredPlayStyle?: "fastest" | "cheapest" | "balanced" | "afk" | undefined;
      availableHoursPerDay?: number | undefined;
    },
  ): Promise<ToolEnvelope<Awaited<ReturnType<ProfileService["updatePreferences"]>>>> {
    return envelope(
      await this.profiles.updatePreferences(profileId, input),
      "local SQLite profile",
    );
  }

  public async exportPlayerProfile(profileId: string): Promise<ToolEnvelope<ProfileExport>> {
    return envelope(await this.profiles.export(profileId), "local SQLite profile");
  }

  public async importPlayerProfile(
    profile: unknown,
  ): Promise<ToolEnvelope<Awaited<ReturnType<ProfileService["import"]>>>> {
    return envelope(await this.profiles.import(profile), "local SQLite profile");
  }

  public async getSelectedPlayerSnapshot() {
    return envelope(
      await this.privateDataService().getSelectedPlayerSnapshot(),
      "selected local profile and private SQLite data",
    );
  }

  public async setSelectedPlayerProfile(profileId: string) {
    return envelope(
      await this.privateDataService().setSelectedProfile(profileId),
      "local SQLite selected-profile state",
    );
  }

  public async getPlayerHoldings(profileId: string) {
    return envelope(
      await this.privateDataService().getHoldings(profileId),
      "user-entered local holdings snapshot",
    );
  }

  public async replacePlayerHoldings(input: {
    profileId: string;
    cashGp?: number | undefined;
    items: PlayerHolding[];
    source?: PlayerPrivateDataSource | undefined;
    capturedAt?: string | undefined;
    confirmReplace: boolean;
  }) {
    return envelope(
      await this.privateDataService().replaceHoldings(input),
      "user-confirmed local holdings snapshot",
    );
  }

  public async upsertPlayerHolding(input: {
    profileId: string;
    holding: PlayerHolding;
    cashGp?: number | undefined;
    source?: PlayerPrivateDataSource | undefined;
  }) {
    return envelope(
      await this.privateDataService().upsertHolding(input),
      "user-entered local holdings snapshot",
    );
  }

  public async importPlayerHoldings(input: {
    profileId: string;
    format: "csv" | "json";
    content: string;
    confirmReplace: boolean;
  }) {
    return envelope(
      await this.privateDataService().importHoldings(input),
      `user-confirmed local ${input.format.toUpperCase()} import`,
    );
  }

  public async exportPlayerHoldings(profileId: string, format: "csv" | "json") {
    return envelope(
      await this.privateDataService().exportHoldings(profileId, format),
      "user-entered local holdings snapshot",
    );
  }

  public async recordGeTrade(input: {
    profileId: string;
    itemId: number;
    side: "buy" | "sell";
    quantity: number;
    unitPrice: number;
    occurredAt: string;
    source: PlayerPrivateDataSource;
    notes?: string | undefined;
  }) {
    return envelope(
      await this.privateDataService().recordTrade(input),
      "user-entered local Grand Exchange trade journal",
    );
  }

  public async listGeTrades(profileId: string) {
    return envelope(
      await this.privateDataService().listTrades(profileId),
      "private local Grand Exchange trade journal",
    );
  }

  public async updateGeTrade(
    profileId: string,
    tradeId: string,
    updates: {
      itemId?: number | undefined;
      side?: "buy" | "sell" | undefined;
      quantity?: number | undefined;
      unitPrice?: number | undefined;
      occurredAt?: string | undefined;
      source?: PlayerPrivateDataSource | undefined;
      notes?: string | undefined;
    },
  ) {
    return envelope(
      await this.privateDataService().updateTrade(profileId, tradeId, updates),
      "user-entered local Grand Exchange trade journal",
    );
  }

  public async removeGeTrade(profileId: string, tradeId: string) {
    return envelope(
      await this.privateDataService().removeTrade(profileId, tradeId),
      "user-confirmed local Grand Exchange trade journal",
    );
  }

  public async getMarketPreferences(profileId: string) {
    return envelope(
      await this.privateDataService().getMarketPreferences(profileId),
      "private local market preferences",
    );
  }

  public async updateMarketPreferences(
    profileId: string,
    updates: {
      riskTolerance?: MarketPreferences["riskTolerance"] | undefined;
      strategy?: MarketPreferences["strategy"] | undefined;
      maximumAllocationPercent?: number | undefined;
      minimumVolume?: number | undefined;
      maximumVolatility?: number | undefined;
      minimumDataConfidence?: number | undefined;
      avoidNewOrUnstableItems?: boolean | undefined;
    },
  ) {
    return envelope(
      await this.privateDataService().updateMarketPreferences(profileId, updates),
      "private local market preferences",
    );
  }

  public async createMarketWatchlist(input: {
    profileId: string;
    name: string;
    itemIds?: number[] | undefined;
  }) {
    return envelope(
      await this.privateDataService().createWatchlist(input),
      "private local market watchlist",
    );
  }

  public async updateMarketWatchlist(
    profileId: string,
    watchlistId: string,
    updates: { name?: string | undefined; itemIds?: number[] | undefined },
  ) {
    return envelope(
      await this.privateDataService().updateWatchlist(profileId, watchlistId, updates),
      "private local market watchlist",
    );
  }

  public async getMarketWatchlist(profileId: string, watchlistId?: string) {
    return envelope(
      await this.privateDataService().getWatchlists(profileId, watchlistId),
      "private local market watchlist",
    );
  }

  public async analyseGeItem(profileId: string, item: ItemReference, forceRefresh = false) {
    return envelope(
      await this.marketIntelligenceService().analyseGeItem(profileId, item, { forceRefresh }),
      "deterministic RS3 market intelligence over public guide-price sources",
    );
  }

  public async scanGeOpportunities(
    profileId: string,
    items: ItemReference[],
    forceRefresh = false,
  ) {
    return envelope(
      await this.marketIntelligenceService().scanGeOpportunities(profileId, items, {
        forceRefresh,
      }),
      "versioned deterministic RS3 market scoring",
    );
  }

  public async getGeBuyCandidates(profileId: string, items: ItemReference[], forceRefresh = false) {
    const results = await this.marketIntelligenceService().scanGeOpportunities(profileId, items, {
      forceRefresh,
    });
    return envelope(
      results.filter(
        ({ recommendation }) =>
          recommendation === "strong-buy-candidate" || recommendation === "buy-candidate",
      ),
      "versioned deterministic RS3 buy-candidate filter",
    );
  }

  public async getGeSellCandidates(
    profileId: string,
    items: ItemReference[],
    forceRefresh = false,
  ) {
    const results = await this.marketIntelligenceService().scanGeOpportunities(profileId, items, {
      forceRefresh,
    });
    return envelope(
      results.filter(
        ({ recommendation }) => recommendation === "sell-candidate" || recommendation === "reduce",
      ),
      "confirmed-holdings-aware deterministic RS3 sell-candidate filter",
    );
  }

  public async createManualGeOrderPlan(
    profileId: string,
    item: ItemReference,
    forceRefresh = false,
  ) {
    return envelope(
      await this.marketIntelligenceService().createManualOrderPlan(profileId, item, {
        forceRefresh,
      }),
      "non-executing deterministic manual order plan",
    );
  }

  public async backtestGeStrategy(
    itemId: number,
    input: MarketBacktestInput,
    forceRefresh = false,
  ) {
    return envelope(
      await this.marketIntelligenceService().backtestGeStrategy(itemId, input, { forceRefresh }),
      "chronological public guide-price backtest",
    );
  }

  public async getPortfolioSummary(profileId: string) {
    return envelope(
      await this.marketIntelligenceService().getPortfolioSummary(profileId),
      "user-entered holdings and public guide-price valuation",
    );
  }

  public calculateXpRemaining(
    currentExperience: number,
    targetLevel: number,
    skillId?: SkillId,
  ): ToolEnvelope<ReturnType<typeof calculateSkillProgress>> {
    return envelope(
      calculateSkillProgress(currentExperience, targetLevel, skillId),
      "deterministic RuneScape XP table",
    );
  }

  public async getSkillProgress(
    profileId: string,
    skillId: SkillId,
    targetLevel: number,
  ): Promise<
    ToolEnvelope<
      ReturnType<typeof calculateSkillProgress> & {
        skillId: SkillId;
        hiscoresRefreshedAt?: string;
      }
    >
  > {
    const profile = await this.profiles.get(profileId);
    const skill = profile.skills.find((candidate) => candidate.skillId === skillId);
    if (skill === undefined) {
      throw new NotFoundError(`Skill ${skillId}; refresh the profile's public Hiscores first`);
    }

    return envelope(
      {
        skillId,
        ...calculateSkillProgress(skill.experience, targetLevel, skillId),
        ...(profile.lastHiscoresRefresh === undefined
          ? {}
          : { hiscoresRefreshedAt: profile.lastHiscoresRefresh }),
      },
      "local profile and deterministic RuneScape XP table",
    );
  }

  public async getItemPrice(
    itemId: number,
    forceRefresh = false,
  ): Promise<ToolEnvelope<Awaited<ReturnType<PriceProvider["getCurrentPrice"]>>>> {
    const item = await this.prices.getCurrentPrice(itemId, { forceRefresh });
    return envelope(item, item.sourceName);
  }

  public async searchItems(query: string, limit?: number) {
    return envelope(
      await this.exchangeService().search(query, limit),
      "validated local RS3 Grand Exchange catalogue",
    );
  }

  public async getItemDetails(item: ItemReference) {
    const details = await this.exchangeService().getItemDetails(item);
    return envelope(details, details.sourceName);
  }

  public async getItemPriceHistory(
    item: ItemReference,
    range: "24h" | "7d" | "30d" | "90d" | "180d" = "30d",
    forceRefresh = false,
  ) {
    return envelope(
      await this.exchangeService().getPriceHistory(item, range, forceRefresh),
      "Jagex Grand Exchange ItemDB graph and local SQLite history",
    );
  }

  public async getItemBuyLimit(item: ItemReference) {
    const details = await this.exchangeService().getItemDetails(item);
    return envelope(
      {
        itemId: details.itemId,
        name: details.name,
        ...(details.buyLimit === undefined ? {} : { buyLimit: details.buyLimit }),
        available: details.buyLimit !== undefined,
        sourceUpdatedAt: details.timestamp,
      },
      details.sourceName,
    );
  }

  public async getItemAlchemyValue(item: ItemReference) {
    const details = await this.exchangeService().getItemDetails(item);
    return envelope(
      {
        itemId: details.itemId,
        name: details.name,
        ...(details.alchemyValue === undefined ? {} : { highAlchemyValue: details.alchemyValue }),
        ...(details.lowAlchemyValue === undefined
          ? {}
          : { lowAlchemyValue: details.lowAlchemyValue }),
        available: details.alchemyValue !== undefined || details.lowAlchemyValue !== undefined,
        sourceUpdatedAt: details.timestamp,
      },
      details.sourceName,
    );
  }

  public async getItemPriceSummary(
    item: ItemReference,
    range: "24h" | "7d" | "30d" | "90d" | "180d" = "30d",
    forceRefresh = false,
  ) {
    return envelope(
      await this.exchangeService().getPriceSummary(item, range, forceRefresh),
      "deterministic price analytics over validated Jagex history",
    );
  }

  public async compareItemPrices(
    items: ItemReference[],
    range: "24h" | "7d" | "30d" | "90d" | "180d" = "30d",
  ) {
    return envelope(
      await this.exchangeService().comparePrices(items, range),
      "deterministic price analytics over validated Jagex history",
    );
  }

  public async valueItemList(items: ValuationRequestLine[]) {
    return envelope(
      await this.exchangeService().valueItemList(items),
      "validated local RS3 Grand Exchange guide prices",
    );
  }

  public async valueEquipmentSetup(items: EquipmentValuationRequestLine[]) {
    return envelope(
      await this.exchangeService().valueEquipmentSetup(items),
      "validated local RS3 Grand Exchange guide prices",
    );
  }

  public async calculateQuestShoppingCost(profileId: string, quest: string) {
    return envelope(
      await this.exchangeService().calculateQuestShoppingCost(profileId, quest),
      "deterministic quest shopping list and validated guide prices",
    );
  }

  public async calculateTrainingCost(
    input: LevellingPlanInput,
    materials: ValuationRequestLine[] = [],
  ) {
    return envelope(
      await this.exchangeService().calculateTrainingCost(input, materials),
      "deterministic levelling plan and validated guide prices",
    );
  }

  public async exportPriceData(input: ExportPriceDataInput) {
    return envelope(
      await this.exchangeService().exportPriceData(input),
      "validated local catalogue and Jagex price history",
    );
  }

  public async refreshPriceData(itemIds?: number[]) {
    return envelope(
      await this.exchangeService().refreshData(itemIds),
      "RS3 Grand Exchange public sources and local SQLite",
    );
  }

  public async getPriceDataStatus() {
    return envelope(
      await this.exchangeService().getDataStatus(),
      "local SQLite Grand Exchange sync status",
    );
  }

  public async searchQuests(query: string, limit?: number) {
    return envelope(
      await this.questService().search(query, limit),
      "validated local RuneScape Wiki quest snapshot",
    );
  }

  public async getQuest(identifier: string) {
    return envelope(
      await this.questService().get(identifier),
      "validated local RuneScape Wiki quest snapshot",
    );
  }

  public async getQuestRequirements(identifier: string) {
    const quest = await this.questService().get(identifier);
    return envelope(
      {
        questId: quest.id,
        prerequisiteGroups: quest.prerequisiteGroups,
        skillRequirements: quest.skillRequirements,
        questPointRequirement: quest.questPointRequirement,
        otherRequirements: quest.otherRequirements,
        itemRequirements: quest.itemRequirements,
        recommendedItems: quest.recommendedItems,
      },
      quest.sourceName,
    );
  }

  public async getQuestRewards(identifier: string) {
    const quest = await this.questService().get(identifier);
    return envelope(
      {
        questId: quest.id,
        questPointReward: quest.questPointReward ?? 0,
        rewards: quest.rewards,
      },
      quest.sourceName,
    );
  }

  public async getQuestSource(identifier: string) {
    const quest = await this.questService().get(identifier);
    return envelope(
      {
        questId: quest.id,
        sourceName: quest.sourceName,
        sourcePageUrl: quest.sourcePageUrl,
        guideUrl: quest.guideUrl,
        sourceRevision: quest.sourceRevision,
        sourceUpdatedAt: quest.sourceUpdatedAt,
        lastCheckedAt: quest.lastCheckedAt,
        contentHash: quest.contentHash,
      },
      quest.sourceName,
    );
  }

  public async setQuestStatus(profileId: string, identifier: string, status: QuestStatus) {
    return envelope(
      await this.questService().setStatus(profileId, identifier, status),
      "local SQLite profile",
    );
  }

  public async setMultipleQuestStatuses(
    profileId: string,
    updates: ReadonlyArray<{ quest: string; status: QuestStatus }>,
  ) {
    return envelope(
      await this.questService().setMultipleStatuses(
        profileId,
        updates.map((update) => ({ questId: update.quest, status: update.status })),
      ),
      "local SQLite profile",
    );
  }

  public async listAvailableQuests(profileId: string) {
    return envelope(
      await this.questService().listAvailable(profileId),
      "local profile and validated RuneScape Wiki quest snapshot",
    );
  }

  public async listMissingQuestRequirements(profileId: string, identifier: string) {
    return envelope(
      await this.questService().listMissingRequirements(profileId, identifier),
      "local profile and validated RuneScape Wiki quest snapshot",
    );
  }

  public async createQuestRoute(profileId: string, identifier: string) {
    return envelope(
      await this.questService().createRoute(profileId, identifier),
      "deterministic quest prerequisite graph",
    );
  }

  public async createQuestShoppingList(profileId: string, identifier: string) {
    return envelope(
      await this.questService().createShoppingList(profileId, identifier),
      "deterministic quest route and validated RuneScape Wiki item requirements",
    );
  }

  public async refreshQuestData() {
    return envelope(await this.questService().refreshData(), "RuneScape Wiki and local SQLite");
  }

  public async getQuestDataStatus() {
    return envelope(await this.questService().getDataStatus(), "local SQLite quest sync status");
  }

  public async listTrainingMethods(input: {
    skillId?: SkillId | undefined;
    level?: number | undefined;
    members?: boolean | undefined;
    ironman?: boolean | undefined;
  }) {
    return envelope(
      await this.plannerService().list(input),
      "validated local RuneScape Wiki training snapshot",
    );
  }

  public async getTrainingMethod(methodId: string) {
    const method = await this.plannerService().get(methodId);
    return envelope(method, method.sourceName);
  }

  public async compareTrainingMethods(input: {
    profileId: string;
    skillId: SkillId;
    targetLevel: number;
    methodIds?: string[] | undefined;
    members?: boolean | undefined;
    allowVirtualLevels?: boolean | undefined;
  }) {
    return envelope(
      await this.plannerService().compare(input),
      "local profile and validated RuneScape Wiki training snapshot",
    );
  }

  public async createLevellingPlan(input: LevellingPlanInput) {
    return envelope(
      await this.plannerService().createPlan(input),
      "deterministic levelling planner and validated training snapshot",
    );
  }

  public async createWeeklyGoalPlan(input: LevellingPlanInput & { weeks?: number | undefined }) {
    return envelope(
      await this.plannerService().createWeeklyGoalPlan(input),
      "deterministic levelling planner and local profile preferences",
    );
  }

  public async estimateTimeToLevel(input: LevellingPlanInput) {
    const plan = await this.plannerService().createPlan(input);
    return envelope(
      {
        skillId: plan.skillId,
        targetLevel: plan.targetLevel,
        experienceRequired: plan.experienceRequired,
        hoursRange: plan.totalHoursRange,
        completionDateRange: plan.completionDateRange,
        feasible: plan.feasible,
        warnings: plan.warnings,
      },
      "deterministic levelling planner",
    );
  }

  public async estimateCostToLevel(input: LevellingPlanInput) {
    const plan = await this.plannerService().createPlan(input);
    return envelope(
      {
        skillId: plan.skillId,
        targetLevel: plan.targetLevel,
        experienceRequired: plan.experienceRequired,
        gpRange: plan.totalGpRange,
        feasible: plan.feasible,
        warnings: plan.warnings,
      },
      "deterministic levelling planner",
    );
  }

  public async compareQuestXpRewards(skillId: SkillId, profileId?: string, limit?: number) {
    return envelope(
      await this.plannerService().compareQuestXpRewards(skillId, profileId, limit),
      "validated local RuneScape Wiki quest snapshot",
    );
  }

  public async refreshTrainingData() {
    return envelope(await this.plannerService().refreshData(), "RuneScape Wiki and local SQLite");
  }

  public async getTrainingDataStatus() {
    return envelope(
      await this.plannerService().getDataStatus(),
      "local SQLite training sync status",
    );
  }
}
