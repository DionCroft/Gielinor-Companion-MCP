import type {
  GameMode,
  GrandExchangeItem,
  PlayerProfile,
  PlayerStatsResult,
  PriceHistoryRange,
  PricePoint,
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

export interface PlayerProfileRepository {
  create(profile: PlayerProfile): Promise<PlayerProfile>;
  getById(id: string): Promise<PlayerProfile | null>;
  list(): Promise<PlayerProfile[]>;
  save(profile: PlayerProfile): Promise<PlayerProfile>;
}
