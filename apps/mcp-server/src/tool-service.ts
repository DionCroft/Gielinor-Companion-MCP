import { CompanionError, NotFoundError, calculateSkillProgress } from "@gielinor/core";
import type { PriceProvider, ProfileService } from "@gielinor/core";
import type { GameMode, ProfileExport, SkillId } from "@gielinor/shared-types";

export type ToolEnvelope<T> = {
  data: T;
  meta: {
    generatedAt: string;
    source: string;
  };
};

export type ToolError = {
  code: string;
  message: string;
};

function envelope<T>(data: T, source: string): ToolEnvelope<T> {
  return {
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source,
    },
  };
}

export function publicToolError(error: unknown): ToolError {
  if (error instanceof CompanionError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The request could not be completed",
  };
}

export class CompanionToolService {
  public constructor(
    private readonly profiles: ProfileService,
    private readonly prices: PriceProvider,
  ) {}

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

  public calculateXpRemaining(
    currentExperience: number,
    targetLevel: number,
  ): ToolEnvelope<ReturnType<typeof calculateSkillProgress>> {
    return envelope(
      calculateSkillProgress(currentExperience, targetLevel),
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
        ...calculateSkillProgress(skill.experience, targetLevel),
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
}
