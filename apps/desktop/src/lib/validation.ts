import { PlayerProfileSchema, SkillIdSchema, TrainingStrategySchema } from "@gielinor/shared-types";
import { z } from "zod";

export const CreateProfileFormSchema = z
  .object({
    displayName: PlayerProfileSchema.shape.displayName,
    gameMode: z.enum(["normal", "ironman", "hardcore-ironman"]),
  })
  .strict();

export const QuestSearchFormSchema = z
  .object({
    query: z.string().trim().min(2, "Enter at least two characters").max(100),
  })
  .strict();

export const LevellingPlanFormSchema = z
  .object({
    skillId: SkillIdSchema,
    targetLevel: z.coerce.number().int().min(2).max(150),
    strategy: TrainingStrategySchema,
    budgetGp: z.union([z.literal(""), z.coerce.number().int().nonnegative()]),
    hoursPerDay: z.union([z.literal(""), z.coerce.number().positive().max(24)]),
  })
  .strict();

export const ItemSearchFormSchema = z
  .object({
    query: z.string().trim().min(2, "Enter at least two characters").max(100),
  })
  .strict();

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the highlighted values";
}
