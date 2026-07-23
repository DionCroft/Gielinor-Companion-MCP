import { randomUUID } from "node:crypto";

import {
  GameModeSchema,
  PlayerProfileSchema,
  PlayStyleSchema,
  ProfileExportSchema,
  type GameMode,
  type PlayerProfile,
  type PlayerStatsResult,
  type PlayStyle,
  type ProfileExport,
  type QuestStatus,
} from "@gielinor/shared-types";
import { z } from "zod";

import { NotFoundError } from "./errors.js";
import type { PlayerProfileRepository, PlayerStatsProvider } from "./ports.js";

export const CreatePlayerProfileInputSchema = z
  .object({
    displayName: PlayerProfileSchema.shape.displayName,
    gameMode: GameModeSchema.optional(),
    availableGp: PlayerProfileSchema.shape.availableGp,
    preferredPlayStyle: PlayStyleSchema.optional(),
    availableHoursPerDay: PlayerProfileSchema.shape.availableHoursPerDay,
  })
  .strict();
export type CreatePlayerProfileInput = z.infer<typeof CreatePlayerProfileInputSchema>;

export const UpdatePlayerPreferencesInputSchema = z
  .object({
    availableGp: PlayerProfileSchema.shape.availableGp,
    preferredPlayStyle: PlayStyleSchema.optional(),
    availableHoursPerDay: PlayerProfileSchema.shape.availableHoursPerDay,
  })
  .strict();
export type UpdatePlayerPreferencesInput = z.infer<typeof UpdatePlayerPreferencesInputSchema>;

export const QuestStatusUpdateSchema = z
  .object({
    questId: z.string().trim().min(1),
    status: z.enum(["not-started", "in-progress", "completed"]),
  })
  .strict();
export type QuestStatusUpdate = z.infer<typeof QuestStatusUpdateSchema>;

export class ProfileService {
  public constructor(
    private readonly repository: PlayerProfileRepository,
    private readonly statsProvider: PlayerStatsProvider,
  ) {}

  public async create(input: CreatePlayerProfileInput): Promise<PlayerProfile> {
    const parsed = CreatePlayerProfileInputSchema.parse(input);
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: parsed.displayName,
      gameMode: parsed.gameMode ?? "normal",
      ...(parsed.availableGp === undefined ? {} : { availableGp: parsed.availableGp }),
      ...(parsed.preferredPlayStyle === undefined
        ? {}
        : { preferredPlayStyle: parsed.preferredPlayStyle }),
      ...(parsed.availableHoursPerDay === undefined
        ? {}
        : { availableHoursPerDay: parsed.availableHoursPerDay }),
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    });

    return this.repository.create(profile);
  }

  public async get(id: string): Promise<PlayerProfile> {
    const profile = await this.repository.getById(id);
    if (profile === null) {
      throw new NotFoundError("Player profile");
    }
    return profile;
  }

  public async list(): Promise<PlayerProfile[]> {
    return this.repository.list();
  }

  public async updatePreferences(
    id: string,
    input: UpdatePlayerPreferencesInput,
  ): Promise<PlayerProfile> {
    const profile = await this.get(id);
    const parsed = UpdatePlayerPreferencesInputSchema.parse(input);
    const next = PlayerProfileSchema.parse({ ...profile, ...parsed });
    return this.repository.save(next);
  }

  public async updateQuestStatuses(
    id: string,
    updates: ReadonlyArray<QuestStatusUpdate>,
  ): Promise<PlayerProfile> {
    const profile = await this.get(id);
    const parsedUpdates = z.array(QuestStatusUpdateSchema).min(1).parse(updates);
    const statuses = new Map<string, QuestStatus>();

    for (const questId of profile.inProgressQuestIds) {
      statuses.set(questId, "in-progress");
    }
    for (const questId of profile.completedQuestIds) {
      statuses.set(questId, "completed");
    }
    for (const update of parsedUpdates) {
      if (update.status === "not-started") {
        statuses.delete(update.questId);
      } else {
        statuses.set(update.questId, update.status);
      }
    }

    const next = PlayerProfileSchema.parse({
      ...profile,
      completedQuestIds: [...statuses.entries()]
        .filter(([, status]) => status === "completed")
        .map(([questId]) => questId)
        .sort(),
      inProgressQuestIds: [...statuses.entries()]
        .filter(([, status]) => status === "in-progress")
        .map(([questId]) => questId)
        .sort(),
    });
    return this.repository.save(next);
  }

  public async getPublicStats(
    displayName: string,
    gameMode: GameMode = "normal",
    forceRefresh = false,
  ): Promise<PlayerStatsResult> {
    return this.statsProvider.getPlayerStats(displayName, gameMode, { forceRefresh });
  }

  public async refreshStats(id: string): Promise<PlayerProfile> {
    const profile = await this.get(id);
    const stats = await this.statsProvider.getPlayerStats(profile.displayName, profile.gameMode, {
      forceRefresh: true,
    });
    const updated = PlayerProfileSchema.parse({
      ...profile,
      skills: stats.skills,
      lastHiscoresRefresh: stats.source.retrievedAt,
    });
    return this.repository.save(updated);
  }

  public async export(id: string): Promise<ProfileExport> {
    const profile = await this.get(id);
    return ProfileExportSchema.parse({
      schemaVersion: 1,
      displayName: profile.displayName,
      gameMode: profile.gameMode,
      ...(profile.availableGp === undefined ? {} : { availableGp: profile.availableGp }),
      ...(profile.preferredPlayStyle === undefined
        ? {}
        : { preferredPlayStyle: profile.preferredPlayStyle }),
      ...(profile.availableHoursPerDay === undefined
        ? {}
        : { availableHoursPerDay: profile.availableHoursPerDay }),
      completedQuestIds: profile.completedQuestIds,
      inProgressQuestIds: profile.inProgressQuestIds,
      goals: profile.goals.map((goal) => ({
        type: goal.type,
        ...(goal.targetId === undefined ? {} : { targetId: goal.targetId }),
        ...(goal.targetLevel === undefined ? {} : { targetLevel: goal.targetLevel }),
        ...(goal.targetExperience === undefined ? {} : { targetExperience: goal.targetExperience }),
        ...(goal.targetQuantity === undefined ? {} : { targetQuantity: goal.targetQuantity }),
        ...(goal.targetDate === undefined ? {} : { targetDate: goal.targetDate }),
      })),
    });
  }

  public async import(payload: unknown): Promise<PlayerProfile> {
    const imported = ProfileExportSchema.parse(payload);
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: imported.displayName,
      gameMode: imported.gameMode,
      ...(imported.availableGp === undefined ? {} : { availableGp: imported.availableGp }),
      ...(imported.preferredPlayStyle === undefined
        ? {}
        : { preferredPlayStyle: imported.preferredPlayStyle }),
      ...(imported.availableHoursPerDay === undefined
        ? {}
        : { availableHoursPerDay: imported.availableHoursPerDay }),
      skills: [],
      completedQuestIds: imported.completedQuestIds,
      inProgressQuestIds: imported.inProgressQuestIds,
      goals: imported.goals.map((goal) => ({ ...goal, id: randomUUID() })),
    });
    return this.repository.create(profile);
  }
}

export type PlayerPreferences = {
  availableGp?: number;
  preferredPlayStyle?: PlayStyle;
  availableHoursPerDay?: number;
};
