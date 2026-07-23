import {
  GameModeSchema,
  PlayerProfileSchema,
  PlayStyleSchema,
  ProfileExportSchema,
  SkillIdSchema,
} from "@gielinor/shared-types";
import { z } from "zod";

export const EmptyInputSchema = z.object({}).strict();

export const CreatePlayerProfileToolInputSchema = z
  .object({
    displayName: PlayerProfileSchema.shape.displayName,
    gameMode: GameModeSchema.optional(),
    availableGp: PlayerProfileSchema.shape.availableGp,
    preferredPlayStyle: PlayStyleSchema.optional(),
    availableHoursPerDay: PlayerProfileSchema.shape.availableHoursPerDay,
  })
  .strict();

export const ProfileIdInputSchema = z
  .object({
    profileId: z.string().uuid(),
  })
  .strict();

export const GetPlayerStatsToolInputSchema = z
  .object({
    displayName: PlayerProfileSchema.shape.displayName,
    gameMode: GameModeSchema.optional(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const UpdatePlayerPreferencesToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    availableGp: PlayerProfileSchema.shape.availableGp,
    preferredPlayStyle: PlayStyleSchema.optional(),
    availableHoursPerDay: PlayerProfileSchema.shape.availableHoursPerDay,
  })
  .strict();

export const ImportPlayerProfileToolInputSchema = z
  .object({
    profile: ProfileExportSchema,
  })
  .strict();

export const CalculateXpRemainingToolInputSchema = z
  .object({
    currentExperience: z.number().int().min(0).max(5_800_000_000),
    targetLevel: z.number().int().min(1).max(126),
  })
  .strict();

export const GetSkillProgressToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    skillId: SkillIdSchema,
    targetLevel: z.number().int().min(1).max(126),
  })
  .strict();

export const GetItemPriceToolInputSchema = z
  .object({
    itemId: z.number().int().positive(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();
