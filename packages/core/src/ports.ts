import type {
  GameMode,
  GrandExchangeItem,
  GeTradeRecord,
  MarketPreferences,
  MarketHistorySeries,
  MarketPriceObservation,
  MarketWatchlist,
  PlayerProfile,
  PlayerHoldingsSnapshot,
  PlayerStatsResult,
  PriceCatalogueItem,
  PriceDataSnapshot,
  PriceDataStatus,
  PriceHistoryRange,
  PricePoint,
  PriceSyncResult,
  Quest,
  RuneScapeNewsSnapshot,
  QuestDataSnapshot,
  QuestDataStatus,
  QuestSyncResult,
  SkillId,
  TrainingDataSnapshot,
  TrainingDataStatus,
  TrainingMethod,
  TrainingSyncResult,
  StoredPriceHistory,
} from "@gielinor/shared-types";

export interface ProviderRequestOptions {
  forceRefresh?: boolean;
  offline?: boolean;
}

export interface PlayerStatsProvider {
  getPlayerStats(
    displayName: string,
    gameMode?: GameMode,
    options?: ProviderRequestOptions,
  ): Promise<PlayerStatsResult>;
}

export interface PriceProvider {
  getCurrentPrice(itemId: number, options?: ProviderRequestOptions): Promise<GrandExchangeItem>;
  getPriceHistory(
    itemId: number,
    range: PriceHistoryRange,
    options?: ProviderRequestOptions,
  ): Promise<PricePoint[]>;
}

export interface GrandExchangeDataProvider extends PriceProvider {
  fetchSnapshot(): Promise<PriceDataSnapshot>;
}

export interface MarketHistoryProvider {
  getLatest(itemId: number, options?: ProviderRequestOptions): Promise<MarketPriceObservation>;
  getHistory(
    itemId: number,
    range: PriceHistoryRange,
    options?: ProviderRequestOptions,
  ): Promise<MarketHistorySeries>;
}

export interface RuneScapeNewsProvider {
  fetchNews(options?: ProviderRequestOptions): Promise<RuneScapeNewsSnapshot>;
}

export interface PriceRepository {
  getByIdOrAlias(identifier: number | string): Promise<PriceCatalogueItem | null>;
  search(query: string, limit: number): Promise<PriceCatalogueItem[]>;
  replaceSnapshot(snapshot: PriceDataSnapshot): Promise<PriceSyncResult>;
  getDataStatus(): Promise<PriceDataStatus>;
  recordSyncFailure(code: string, message: string, attemptedAt: string): Promise<void>;
  getPriceHistory(itemId: number): Promise<StoredPriceHistory | null>;
  replacePriceHistory(
    itemId: number,
    points: PricePoint[],
    retrievedAt: string,
    sourceName: string,
  ): Promise<StoredPriceHistory>;
}

export interface PlayerProfileRepository {
  create(profile: PlayerProfile): Promise<PlayerProfile>;
  getById(id: string): Promise<PlayerProfile | null>;
  list(): Promise<PlayerProfile[]>;
  save(profile: PlayerProfile): Promise<PlayerProfile>;
}

export interface PlayerPrivateDataRepository {
  getLatestHoldings(profileId: string): Promise<PlayerHoldingsSnapshot | null>;
  saveHoldings(snapshot: PlayerHoldingsSnapshot): Promise<PlayerHoldingsSnapshot>;
  getTrade(profileId: string, tradeId: string): Promise<GeTradeRecord | null>;
  listTrades(profileId: string): Promise<GeTradeRecord[]>;
  saveTrade(record: GeTradeRecord): Promise<GeTradeRecord>;
  removeTrade(profileId: string, tradeId: string): Promise<boolean>;
  getMarketPreferences(profileId: string): Promise<MarketPreferences | null>;
  saveMarketPreferences(
    profileId: string,
    preferences: MarketPreferences,
    updatedAt: string,
  ): Promise<MarketPreferences>;
  getWatchlist(profileId: string, watchlistId: string): Promise<MarketWatchlist | null>;
  listWatchlists(profileId: string): Promise<MarketWatchlist[]>;
  saveWatchlist(watchlist: MarketWatchlist): Promise<MarketWatchlist>;
  getSelectedProfile(): Promise<{ profileId: string; selectedAt: string } | null>;
  setSelectedProfile(profileId: string, selectedAt: string): Promise<void>;
}

export interface QuestDataProvider {
  fetchSnapshot(): Promise<QuestDataSnapshot>;
}

export interface QuestRepository {
  getByIdOrAlias(identifier: string): Promise<Quest | null>;
  list(): Promise<Quest[]>;
  search(query: string, limit: number): Promise<Quest[]>;
  replaceSnapshot(snapshot: QuestDataSnapshot): Promise<QuestSyncResult>;
  getDataStatus(): Promise<QuestDataStatus>;
  recordSyncFailure(code: string, message: string, attemptedAt: string): Promise<void>;
}

export interface TrainingMethodProvider {
  fetchSnapshot(): Promise<TrainingDataSnapshot>;
}

export interface TrainingMethodRepository {
  getById(id: string): Promise<TrainingMethod | null>;
  list(filters?: {
    skillId?: SkillId | undefined;
    level?: number | undefined;
  }): Promise<TrainingMethod[]>;
  replaceSnapshot(snapshot: TrainingDataSnapshot): Promise<TrainingSyncResult>;
  getDataStatus(): Promise<TrainingDataStatus>;
  recordSyncFailure(code: string, message: string, attemptedAt: string): Promise<void>;
}
