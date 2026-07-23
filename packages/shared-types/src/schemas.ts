import { z } from "zod";

import { SKILL_IDS } from "./skills.js";

const isoDateTime = z.string().datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative();

export const GameModeSchema = z.enum(["normal", "ironman", "hardcore-ironman", "unknown"]);
export type GameMode = z.infer<typeof GameModeSchema>;

export const PlayStyleSchema = z.enum(["fastest", "cheapest", "balanced", "afk"]);
export type PlayStyle = z.infer<typeof PlayStyleSchema>;

export const SkillIdSchema = z.enum(SKILL_IDS);

export const PlayerSkillSchema = z
  .object({
    skillId: SkillIdSchema,
    level: z.number().int().min(1).max(126),
    experience: nonNegativeInteger.max(5_800_000_000),
    rank: z.number().int().min(-1).optional(),
  })
  .strict();
export type PlayerSkill = z.infer<typeof PlayerSkillSchema>;

export const PlayerGoalSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["level", "experience", "quest", "quest-cape", "item", "custom"]),
    targetId: z.string().min(1).optional(),
    targetLevel: z.number().int().min(1).max(126).optional(),
    targetExperience: nonNegativeInteger.optional(),
    targetQuantity: z.number().int().positive().optional(),
    targetDate: isoDateTime.optional(),
  })
  .strict();
export type PlayerGoal = z.infer<typeof PlayerGoalSchema>;

export const PlayerProfileSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(12)
      .regex(/^[A-Za-z0-9 _-]+$/, "Use a valid public RuneScape display name"),
    gameMode: GameModeSchema,
    availableGp: nonNegativeInteger.optional(),
    preferredPlayStyle: PlayStyleSchema.optional(),
    availableHoursPerDay: z.number().positive().max(24).optional(),
    skills: z.array(PlayerSkillSchema),
    completedQuestIds: z.array(z.string().min(1)),
    inProgressQuestIds: z.array(z.string().min(1)),
    goals: z.array(PlayerGoalSchema),
    lastHiscoresRefresh: isoDateTime.optional(),
  })
  .strict();
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

export const SkillRequirementSchema = z
  .object({
    skillId: SkillIdSchema,
    level: z.number().int().min(1).max(120),
    boostable: z.boolean().optional(),
  })
  .strict();
export type SkillRequirement = z.infer<typeof SkillRequirementSchema>;

export const QuestItemRequirementSchema = z
  .object({
    itemId: z.number().int().positive().optional(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    consumed: z.boolean().optional(),
    alternatives: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type QuestItemRequirement = z.infer<typeof QuestItemRequirementSchema>;

export const QuestRewardSchema = z
  .object({
    type: z.enum(["experience", "quest-points", "item", "unlock", "other"]),
    skillId: SkillIdSchema.optional(),
    amount: nonNegativeInteger.optional(),
    itemId: z.number().int().positive().optional(),
    description: z.string().min(1),
  })
  .strict();
export type QuestReward = z.infer<typeof QuestRewardSchema>;

export const QuestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    members: z.boolean(),
    difficulty: z.string().min(1).optional(),
    length: z.string().min(1).optional(),
    questPointReward: nonNegativeInteger.optional(),
    prerequisiteQuestIds: z.array(z.string().min(1)),
    skillRequirements: z.array(SkillRequirementSchema),
    itemRequirements: z.array(QuestItemRequirementSchema),
    recommendedItems: z.array(QuestItemRequirementSchema),
    rewards: z.array(QuestRewardSchema),
    guideUrl: z.string().url().optional(),
    sourceName: z.string().min(1),
    sourceRevision: z.string().min(1).optional(),
    sourceUpdatedAt: isoDateTime.optional(),
    lastCheckedAt: isoDateTime,
  })
  .strict();
export type Quest = z.infer<typeof QuestSchema>;

export const RequirementSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("skill"),
      skillId: SkillIdSchema,
      level: z.number().int().min(1).max(120),
    })
    .strict(),
  z.object({ type: z.literal("quest"), questId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal("item"),
      itemId: z.number().int().positive(),
      quantity: z.number().int().positive(),
    })
    .strict(),
]);
export type Requirement = z.infer<typeof RequirementSchema>;

export const TrainingMethodSchema = z
  .object({
    id: z.string().min(1),
    skillId: SkillIdSchema,
    minimumLevel: z.number().int().min(1).max(120),
    maximumLevel: z.number().int().min(1).max(126).optional(),
    xpPerHour: z.number().positive().optional(),
    gpPerHour: z.number().optional(),
    gpPerXp: z.number().optional(),
    intensity: z.enum(["low", "medium", "high"]).optional(),
    members: z.boolean().optional(),
    requirements: z.array(RequirementSchema),
    sourceUrl: z.string().url().optional(),
    sourceUpdatedAt: isoDateTime.optional(),
  })
  .strict();
export type TrainingMethod = z.infer<typeof TrainingMethodSchema>;

export const GrandExchangeItemSchema = z
  .object({
    itemId: z.number().int().positive(),
    name: z.string().min(1),
    currentPrice: nonNegativeInteger.optional(),
    highPrice: nonNegativeInteger.optional(),
    lowPrice: nonNegativeInteger.optional(),
    buyLimit: nonNegativeInteger.optional(),
    alchemyValue: nonNegativeInteger.optional(),
    volume: nonNegativeInteger.optional(),
    timestamp: isoDateTime.optional(),
    sourceName: z.string().min(1),
    cacheStatus: z.enum(["miss", "fresh", "stale"]).optional(),
    cacheStoredAt: isoDateTime.optional(),
  })
  .strict();
export type GrandExchangeItem = z.infer<typeof GrandExchangeItemSchema>;

export const PricePointSchema = z
  .object({
    timestamp: isoDateTime,
    price: nonNegativeInteger,
    volume: nonNegativeInteger.optional(),
  })
  .strict();
export type PricePoint = z.infer<typeof PricePointSchema>;

export const PriceHistoryRangeSchema = z.enum(["24h", "7d", "30d", "90d", "180d"]);
export type PriceHistoryRange = z.infer<typeof PriceHistoryRangeSchema>;

export const DataSourceSchema = z
  .object({
    name: z.string().min(1),
    retrievedAt: isoDateTime,
    cacheStatus: z.enum(["miss", "fresh", "stale"]),
    cacheStoredAt: isoDateTime,
  })
  .strict();
export type DataSource = z.infer<typeof DataSourceSchema>;

export const PlayerStatsResultSchema = z
  .object({
    displayName: PlayerProfileSchema.shape.displayName,
    gameMode: GameModeSchema,
    skills: z.array(PlayerSkillSchema).length(SKILL_IDS.length),
    source: DataSourceSchema,
  })
  .strict();
export type PlayerStatsResult = z.infer<typeof PlayerStatsResultSchema>;

export const ExportedPlayerGoalSchema = PlayerGoalSchema.omit({ id: true }).strict();
export type ExportedPlayerGoal = z.infer<typeof ExportedPlayerGoalSchema>;

export const ProfileExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    displayName: PlayerProfileSchema.shape.displayName,
    gameMode: GameModeSchema,
    availableGp: nonNegativeInteger.optional(),
    preferredPlayStyle: PlayStyleSchema.optional(),
    availableHoursPerDay: z.number().positive().max(24).optional(),
    completedQuestIds: z.array(z.string().min(1)),
    inProgressQuestIds: z.array(z.string().min(1)),
    goals: z.array(ExportedPlayerGoalSchema),
  })
  .strict();
export type ProfileExport = z.infer<typeof ProfileExportSchema>;

export const GameUpdateSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    publishedAt: isoDateTime,
    sourceName: z.string().min(1),
  })
  .strict();
export type GameUpdate = z.infer<typeof GameUpdateSchema>;
