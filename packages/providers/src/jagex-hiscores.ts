import type { PlayerStatsProvider, ProviderRequestOptions } from "@gielinor/core";
import {
  GameModeSchema,
  PlayerProfileSchema,
  PlayerStatsResultSchema,
  type GameMode,
  type PlayerSkill,
  type PlayerStatsResult,
} from "@gielinor/shared-types";

import {
  MemoryCacheStore,
  StaleWhileRevalidateCache,
  type CachePolicy,
  type CacheStore,
} from "./cache.js";
import { ProviderError, type ResilientHttpClient } from "./http.js";
import { parseHiscoresCsv } from "./jagex-hiscores-parser.js";

const DEFAULT_ENDPOINTS: Readonly<Record<Exclude<GameMode, "unknown">, string>> = {
  normal: "https://secure.runescape.com/m=hiscore/index_lite.ws",
  ironman: "https://secure.runescape.com/m=hiscore_ironman/index_lite.ws",
  "hardcore-ironman": "https://secure.runescape.com/m=hiscore_hardcore_ironman/index_lite.ws",
};

type CachedStats = {
  displayName: string;
  gameMode: GameMode;
  skills: PlayerSkill[];
  retrievedAt: string;
};

export type JagexHiscoresOptions = {
  httpClient: ResilientHttpClient;
  cacheStore?: CacheStore;
  cachePolicy?: CachePolicy;
  normalEndpoint?: string;
  now?: () => number;
};

export function parseHiscoresResponse(body: string): PlayerSkill[] {
  try {
    return parseHiscoresCsv(body);
  } catch (error) {
    throw new ProviderError(
      error instanceof Error ? error.message : "Jagex Hiscores returned malformed skill data",
      "MALFORMED_PROVIDER_RESPONSE",
      false,
      { cause: error },
    );
  }
}

export class JagexHiscoresProvider implements PlayerStatsProvider {
  private readonly cache: StaleWhileRevalidateCache;
  private readonly cachePolicy: CachePolicy;
  private readonly normalEndpoint: string;

  public constructor(private readonly options: JagexHiscoresOptions) {
    this.cache = new StaleWhileRevalidateCache(
      options.cacheStore ?? new MemoryCacheStore(),
      options.now,
    );
    this.cachePolicy = options.cachePolicy ?? {
      freshForMs: 15 * 60_000,
      staleForMs: 60 * 60_000,
    };
    this.normalEndpoint = options.normalEndpoint ?? DEFAULT_ENDPOINTS.normal;
  }

  public async getPlayerStats(
    displayName: string,
    gameMode: GameMode = "normal",
    requestOptions: ProviderRequestOptions = {},
  ): Promise<PlayerStatsResult> {
    const validatedName = PlayerProfileSchema.shape.displayName.parse(displayName);
    const validatedMode = GameModeSchema.parse(gameMode);
    const effectiveMode = validatedMode === "unknown" ? "normal" : validatedMode;
    const cacheKey = `hiscores:${effectiveMode}:${validatedName.toLocaleLowerCase("en-GB")}`;

    const result = await this.cache.load<CachedStats>(
      cacheKey,
      this.cachePolicy,
      async () => {
        const endpoint =
          effectiveMode === "normal" ? this.normalEndpoint : DEFAULT_ENDPOINTS[effectiveMode];
        const url = new URL(endpoint);
        url.searchParams.set("player", validatedName);
        const response = await this.options.httpClient.get(url);
        const body = await response.text();
        return {
          displayName: validatedName,
          gameMode: validatedMode,
          skills: parseHiscoresResponse(body),
          retrievedAt: new Date().toISOString(),
        };
      },
      requestOptions.forceRefresh ?? false,
      requestOptions.offline ?? false,
    );

    return PlayerStatsResultSchema.parse({
      displayName: result.value.displayName,
      gameMode: result.value.gameMode,
      skills: result.value.skills,
      source: {
        name: "Jagex public Hiscores",
        retrievedAt: result.value.retrievedAt,
        cacheStatus: result.status,
        cacheStoredAt: new Date(result.storedAt).toISOString(),
      },
    });
  }
}
