import {
  GameModeSchema,
  PlayerProfileSchema,
  PlayStyleSchema,
  ProfileExportSchema,
  QuestStatusSchema,
  SkillIdSchema,
} from "@gielinor/shared-types";
import { z } from "zod";

export const EmptyInputSchema = z.object({}).strict();

export const ToolEnvelopeSchema = z
  .object({
    data: z.unknown(),
    meta: z
      .object({
        generatedAt: z.string().datetime({ offset: true }),
        source: z.string().min(1),
      })
      .strict(),
  })
  .strict();

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

export const SearchQuestsToolInputSchema = z
  .object({
    query: z.string().trim().min(1).max(100),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const QuestIdentifierInputSchema = z
  .object({
    quest: z.string().trim().min(1).max(200),
  })
  .strict();

export const ProfileQuestInputSchema = z
  .object({
    profileId: z.string().uuid(),
    quest: z.string().trim().min(1).max(200),
  })
  .strict();

export const SetQuestStatusToolInputSchema = ProfileQuestInputSchema.extend({
  status: QuestStatusSchema,
}).strict();

export const SetMultipleQuestStatusesToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    updates: z
      .array(
        z
          .object({
            quest: z.string().trim().min(1).max(200),
            status: QuestStatusSchema,
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
