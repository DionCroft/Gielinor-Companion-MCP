import type { PlayerStatsProvider, ProviderRequestOptions } from "@gielinor/core";
import {
  GameModeSchema,
  PlayerProfileSchema,
  PlayerSkillSchema,
  PlayerStatsResultSchema,
  SKILL_IDS,
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

function parseInteger(value: string | undefined, field: string): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new ProviderError(
      `Jagex Hiscores returned a malformed ${field} value`,
      "MALFORMED_PROVIDER_RESPONSE",
      false,
    );
  }
  return Number(value);
}

export function parseHiscoresResponse(body: string): PlayerSkill[] {
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < SKILL_IDS.length + 1) {
    throw new ProviderError(
      "Jagex Hiscores returned fewer skill rows than expected",
      "MALFORMED_PROVIDER_RESPONSE",
      false,
    );
  }

  return SKILL_IDS.map((skillId, index) => {
    const columns = lines[index + 1]?.split(",");
    if (columns === undefined || columns.length !== 3) {
      throw new ProviderError(
        `Jagex Hiscores returned a malformed row for ${skillId}`,
        "MALFORMED_PROVIDER_RESPONSE",
        false,
      );
    }

    const rank = parseInteger(columns[0], "rank");
    const level = parseInteger(columns[1], "level");
    const experience = parseInteger(columns[2], "experience");

    try {
      return PlayerSkillSchema.parse({ skillId, rank, level, experience });
    } catch (error) {
      throw new ProviderError(
        `Jagex Hiscores returned invalid values for ${skillId}`,
        "MALFORMED_PROVIDER_RESPONSE",
        false,
        { cause: error },
      );
    }
  });
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
