import {
  CompanionError,
  NotFoundError,
  calculateSkillProgress,
  type PriceProvider,
  type ProfileService,
  type QuestService,
} from "@gielinor/core";
import type { GameMode, ProfileExport, QuestStatus, SkillId } from "@gielinor/shared-types";

import { ToolEnvelopeSchema } from "./schemas.js";

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
  return ToolEnvelopeSchema.parse({
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source,
    },
  }) as ToolEnvelope<T>;
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
    private readonly quests?: QuestService,
  ) {}

  private questService(): QuestService {
    if (this.quests === undefined) {
      throw new CompanionError("Quest companion is not configured", "UNSUPPORTED_FEATURE");
    }
    return this.quests;
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
}
