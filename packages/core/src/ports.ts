import type {
  GameMode,
  GrandExchangeItem,
  PlayerProfile,
  PlayerStatsResult,
  PriceCatalogueItem,
  PriceDataSnapshot,
  PriceDataStatus,
  PriceHistoryRange,
  PricePoint,
  PriceSyncResult,
  Quest,
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
