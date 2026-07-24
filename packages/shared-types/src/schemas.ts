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

export const QuestStatusSchema = z.enum(["not-started", "in-progress", "completed"]);
export type QuestStatus = z.infer<typeof QuestStatusSchema>;

export const QuestPrerequisiteSchema = z
  .object({
    questId: z.string().min(1),
    requiredStatus: z.enum(["started", "completed"]).default("completed"),
  })
  .strict();
export type QuestPrerequisite = z.infer<typeof QuestPrerequisiteSchema>;

export const QuestPrerequisiteGroupSchema = z
  .object({
    mode: z.enum(["all", "any"]),
    quests: z.array(QuestPrerequisiteSchema).min(1),
    description: z.string().min(1).optional(),
  })
  .strict();
export type QuestPrerequisiteGroup = z.infer<typeof QuestPrerequisiteGroupSchema>;

export const QuestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    members: z.boolean(),
    difficulty: z.string().min(1).optional(),
    length: z.string().min(1).optional(),
    questPointReward: nonNegativeInteger.optional(),
    prerequisiteQuestIds: z.array(z.string().min(1)),
    prerequisiteGroups: z.array(QuestPrerequisiteGroupSchema).default([]),
    skillRequirements: z.array(SkillRequirementSchema),
    questPointRequirement: nonNegativeInteger.optional(),
    otherRequirements: z.array(z.string().min(1)).default([]),
    itemRequirements: z.array(QuestItemRequirementSchema),
    recommendedItems: z.array(QuestItemRequirementSchema),
    rewards: z.array(QuestRewardSchema),
    guideUrl: z.string().url().optional(),
    sourcePageUrl: z.string().url().optional(),
    sourceName: z.string().min(1),
    sourceRevision: z.string().min(1).optional(),
    sourceUpdatedAt: isoDateTime.optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    lastCheckedAt: isoDateTime,
  })
  .strict();
export type Quest = z.infer<typeof QuestSchema>;

export const QuestDataSnapshotSchema = z
  .object({
    provider: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceRevision: z.string().min(1),
    retrievedAt: isoDateTime,
    quests: z.array(QuestSchema).min(1),
  })
  .strict();
export type QuestDataSnapshot = z.infer<typeof QuestDataSnapshotSchema>;

export const QuestSyncResultSchema = z
  .object({
    provider: z.string().min(1),
    sourceRevision: z.string().min(1),
    checkedAt: isoDateTime,
    total: nonNegativeInteger,
    inserted: nonNegativeInteger,
    updated: nonNegativeInteger,
    unchanged: nonNegativeInteger,
    removed: nonNegativeInteger,
  })
  .strict();
export type QuestSyncResult = z.infer<typeof QuestSyncResultSchema>;

export const QuestDataStatusSchema = z
  .object({
    state: z.enum(["never-synced", "ready", "failed"]),
    provider: z.string().min(1).optional(),
    sourceRevision: z.string().min(1).optional(),
    lastAttemptAt: isoDateTime.optional(),
    lastSuccessfulSyncAt: isoDateTime.optional(),
    questCount: nonNegativeInteger,
    lastErrorCode: z.string().min(1).optional(),
    lastErrorMessage: z.string().min(1).optional(),
  })
  .strict();
export type QuestDataStatus = z.infer<typeof QuestDataStatusSchema>;

export const QuestAvailabilitySchema = z
  .object({
    quest: QuestSchema,
    status: QuestStatusSchema,
    manualRequirements: z.array(z.string()),
    recommendationScore: z.number(),
    recommendationReasons: z.array(z.string()),
  })
  .strict();
export type QuestAvailability = z.infer<typeof QuestAvailabilitySchema>;

export const MissingSkillRequirementSchema = z
  .object({
    skillId: SkillIdSchema,
    currentLevel: z.number().int().min(1).max(126),
    requiredLevel: z.number().int().min(1).max(120),
    requiredByQuestIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type MissingSkillRequirement = z.infer<typeof MissingSkillRequirementSchema>;

export const MissingQuestRequirementSchema = z
  .object({
    questId: z.string().min(1),
    name: z.string().min(1),
    currentStatus: QuestStatusSchema,
    requiredStatus: z.enum(["started", "completed"]),
  })
  .strict();
export type MissingQuestRequirement = z.infer<typeof MissingQuestRequirementSchema>;

export const MissingQuestRequirementsSchema = z
  .object({
    targetQuestId: z.string().min(1),
    quests: z.array(MissingQuestRequirementSchema),
    skills: z.array(MissingSkillRequirementSchema),
    manualRequirements: z.array(z.string()),
  })
  .strict();
export type MissingQuestRequirements = z.infer<typeof MissingQuestRequirementsSchema>;

export const QuestRouteStepSchema = z
  .object({
    order: z.number().int().positive(),
    questId: z.string().min(1),
    name: z.string().min(1),
    currentStatus: QuestStatusSchema,
    requiredStatus: z.enum(["started", "completed"]),
    guideUrl: z.string().url().optional(),
  })
  .strict();
export type QuestRouteStep = z.infer<typeof QuestRouteStepSchema>;

export const QuestRouteAlternativeSchema = z
  .object({
    groupQuestId: z.string().min(1),
    selectedQuestId: z.string().min(1),
    alternativeQuestIds: z.array(z.string().min(1)),
  })
  .strict();
export type QuestRouteAlternative = z.infer<typeof QuestRouteAlternativeSchema>;

export const QuestRouteSchema = z
  .object({
    targetQuestId: z.string().min(1),
    steps: z.array(QuestRouteStepSchema),
    alternatives: z.array(QuestRouteAlternativeSchema),
  })
  .strict();
export type QuestRoute = z.infer<typeof QuestRouteSchema>;

export const QuestShoppingListItemSchema = z
  .object({
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    itemId: z.number().int().positive().optional(),
    alternatives: z.array(z.string().min(1)),
    requiredByQuestIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type QuestShoppingListItem = z.infer<typeof QuestShoppingListItemSchema>;

export const QuestShoppingListSchema = z
  .object({
    targetQuestId: z.string().min(1),
    routeQuestIds: z.array(z.string().min(1)),
    items: z.array(QuestShoppingListItemSchema),
  })
  .strict();
export type QuestShoppingList = z.infer<typeof QuestShoppingListSchema>;

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
    name: z.string().min(1),
    skillId: SkillIdSchema,
    minimumLevel: z.number().int().min(1).max(120),
    maximumLevel: z.number().int().min(1).max(150).optional(),
    xpPerHour: z.number().positive().optional(),
    xpPerHourRange: z
      .object({
        minimum: z.number().positive(),
        maximum: z.number().positive(),
      })
      .strict()
      .optional(),
    gpPerHour: z.number().optional(),
    gpPerHourRange: z
      .object({
        minimum: z.number(),
        maximum: z.number(),
      })
      .strict()
      .optional(),
    gpPerXp: z.number().optional(),
    intensity: z.enum(["low", "medium", "high"]),
    afkRating: z.enum(["not-afk", "low", "moderate", "high"]),
    members: z.boolean(),
    ironmanCompatibility: z.enum(["supported", "unsupported", "unknown"]),
    requirements: z.array(RequirementSchema).default([]),
    questRequirements: z.array(z.string().min(1)).default([]),
    itemRequirements: z.array(z.string().min(1)).default([]),
    equipment: z.array(z.string().min(1)).default([]),
    notes: z.array(z.string().min(1)).default([]),
    confidence: z.enum(["low", "medium", "high"]),
    uncertaintyNotes: z.array(z.string().min(1)).default([]),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceRevision: z.string().min(1),
    sourceUpdatedAt: isoDateTime,
    lastCheckedAt: isoDateTime,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((method, context) => {
    if (method.maximumLevel !== undefined && method.maximumLevel < method.minimumLevel) {
      context.addIssue({
        code: "custom",
        path: ["maximumLevel"],
        message: "Maximum level cannot be below minimum level",
      });
    }
    if (
      method.xpPerHourRange !== undefined &&
      method.xpPerHourRange.maximum < method.xpPerHourRange.minimum
    ) {
      context.addIssue({
        code: "custom",
        path: ["xpPerHourRange", "maximum"],
        message: "Maximum XP rate cannot be below minimum XP rate",
      });
    }
    if (
      method.gpPerHourRange !== undefined &&
      method.gpPerHourRange.maximum < method.gpPerHourRange.minimum
    ) {
      context.addIssue({
        code: "custom",
        path: ["gpPerHourRange", "maximum"],
        message: "Maximum GP rate cannot be below minimum GP rate",
      });
    }
  });
export type TrainingMethod = z.infer<typeof TrainingMethodSchema>;

export const TrainingDataSnapshotSchema = z
  .object({
    provider: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceRevision: z.string().min(1),
    retrievedAt: isoDateTime,
    methods: z.array(TrainingMethodSchema).min(1),
  })
  .strict();
export type TrainingDataSnapshot = z.infer<typeof TrainingDataSnapshotSchema>;

export const TrainingSyncResultSchema = z
  .object({
    provider: z.string().min(1),
    sourceRevision: z.string().min(1),
    checkedAt: isoDateTime,
    total: nonNegativeInteger,
    inserted: nonNegativeInteger,
    updated: nonNegativeInteger,
    unchanged: nonNegativeInteger,
    removed: nonNegativeInteger,
  })
  .strict();
export type TrainingSyncResult = z.infer<typeof TrainingSyncResultSchema>;

export const TrainingDataStatusSchema = z
  .object({
    state: z.enum(["never-synced", "ready", "failed"]),
    provider: z.string().min(1).optional(),
    sourceRevision: z.string().min(1).optional(),
    lastAttemptAt: isoDateTime.optional(),
    lastSuccessfulSyncAt: isoDateTime.optional(),
    methodCount: nonNegativeInteger,
    coveredSkills: z.array(SkillIdSchema),
    lastErrorCode: z.string().min(1).optional(),
    lastErrorMessage: z.string().min(1).optional(),
  })
  .strict();
export type TrainingDataStatus = z.infer<typeof TrainingDataStatusSchema>;

export const TrainingStrategySchema = z.enum(["fastest", "cheapest", "balanced", "afk"]);
export type TrainingStrategy = z.infer<typeof TrainingStrategySchema>;

export const LevellingPlanStageSchema = z
  .object({
    order: z.number().int().positive(),
    method: TrainingMethodSchema,
    startLevel: z.number().int().min(1).max(150),
    endLevel: z.number().int().min(1).max(150),
    startExperience: nonNegativeInteger,
    endExperience: nonNegativeInteger,
    experienceRequired: nonNegativeInteger,
    hoursRange: z
      .object({
        minimum: z.number().nonnegative(),
        maximum: z.number().nonnegative(),
      })
      .strict(),
    gpRange: z
      .object({
        minimum: z.number(),
        maximum: z.number(),
      })
      .strict()
      .optional(),
    warnings: z.array(z.string()),
  })
  .strict();
export type LevellingPlanStage = z.infer<typeof LevellingPlanStageSchema>;

export const LevellingPlanSchema = z
  .object({
    skillId: SkillIdSchema,
    strategy: TrainingStrategySchema,
    currentLevel: z.number().int().min(1).max(150),
    currentExperience: nonNegativeInteger,
    targetLevel: z.number().int().min(1).max(150),
    targetExperience: nonNegativeInteger,
    trueSkillCap: z.number().int().min(99).max(120),
    virtualTarget: z.boolean(),
    experienceRequired: nonNegativeInteger,
    stages: z.array(LevellingPlanStageSchema),
    totalHoursRange: z
      .object({
        minimum: z.number().nonnegative(),
        maximum: z.number().nonnegative(),
      })
      .strict(),
    totalGpRange: z
      .object({
        minimum: z.number(),
        maximum: z.number(),
      })
      .strict()
      .optional(),
    completionDateRange: z
      .object({
        earliest: isoDateTime,
        latest: isoDateTime,
      })
      .strict()
      .optional(),
    feasible: z.boolean(),
    warnings: z.array(z.string()),
    assumptions: z.array(z.string()),
    generatedAt: isoDateTime,
  })
  .strict();
export type LevellingPlan = z.infer<typeof LevellingPlanSchema>;

export const WeeklyGoalPlanSchema = z
  .object({
    plan: LevellingPlanSchema,
    weeks: z.number().int().positive(),
    weeklyExperienceTarget: nonNegativeInteger,
    weeklyHoursRange: z
      .object({
        minimum: z.number().nonnegative(),
        maximum: z.number().nonnegative(),
      })
      .strict(),
    achievableWithinPeriod: z.boolean(),
  })
  .strict();
export type WeeklyGoalPlan = z.infer<typeof WeeklyGoalPlanSchema>;

export const GrandExchangeItemSchema = z
  .object({
    itemId: z.number().int().positive(),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).optional(),
    description: z.string().min(1).optional(),
    members: z.boolean().optional(),
    currentPrice: nonNegativeInteger.optional(),
    previousPrice: nonNegativeInteger.optional(),
    highPrice: nonNegativeInteger.optional(),
    lowPrice: nonNegativeInteger.optional(),
    buyLimit: nonNegativeInteger.optional(),
    alchemyValue: nonNegativeInteger.optional(),
    lowAlchemyValue: nonNegativeInteger.optional(),
    storeValue: nonNegativeInteger.optional(),
    volume: nonNegativeInteger.optional(),
    timestamp: isoDateTime.optional(),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url().optional(),
    retrievedAt: isoDateTime.optional(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    cacheStatus: z.enum(["miss", "fresh", "stale"]).optional(),
    cacheStoredAt: isoDateTime.optional(),
  })
  .strict();
export type GrandExchangeItem = z.infer<typeof GrandExchangeItemSchema>;

export const PricePointSchema = z
  .object({
    timestamp: isoDateTime,
    price: nonNegativeInteger,
    averagePrice: nonNegativeInteger.optional(),
    volume: nonNegativeInteger.optional(),
  })
  .strict();
export type PricePoint = z.infer<typeof PricePointSchema>;

export const PriceHistoryRangeSchema = z.enum(["24h", "7d", "30d", "90d", "180d"]);
export type PriceHistoryRange = z.infer<typeof PriceHistoryRangeSchema>;

export const PriceCatalogueItemSchema = GrandExchangeItemSchema.extend({
  aliases: z.array(z.string().min(1)),
  timestamp: isoDateTime,
  sourceUrl: z.string().url(),
  retrievedAt: isoDateTime,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PriceCatalogueItem = z.infer<typeof PriceCatalogueItemSchema>;

export const PriceDataSnapshotSchema = z
  .object({
    provider: z.string().min(1),
    sourceRevision: z.string().min(1),
    sourceUpdatedAt: isoDateTime,
    retrievedAt: isoDateTime,
    items: z.array(PriceCatalogueItemSchema).min(1),
  })
  .strict();
export type PriceDataSnapshot = z.infer<typeof PriceDataSnapshotSchema>;

export const PriceSyncResultSchema = z
  .object({
    provider: z.string().min(1),
    sourceRevision: z.string().min(1),
    checkedAt: isoDateTime,
    total: nonNegativeInteger,
    inserted: nonNegativeInteger,
    updated: nonNegativeInteger,
    unchanged: nonNegativeInteger,
    removed: nonNegativeInteger,
  })
  .strict();
export type PriceSyncResult = z.infer<typeof PriceSyncResultSchema>;

export const PriceDataStatusSchema = z
  .object({
    state: z.enum(["never-synced", "ready", "failed"]),
    provider: z.string().min(1).optional(),
    sourceRevision: z.string().min(1).optional(),
    sourceUpdatedAt: isoDateTime.optional(),
    lastAttemptAt: isoDateTime.optional(),
    lastSuccessfulSyncAt: isoDateTime.optional(),
    itemCount: nonNegativeInteger,
    historyItemCount: nonNegativeInteger,
    historyPointCount: nonNegativeInteger,
    newestHistoryAt: isoDateTime.optional(),
    lastErrorCode: z.string().min(1).optional(),
    lastErrorMessage: z.string().min(1).optional(),
  })
  .strict();
export type PriceDataStatus = z.infer<typeof PriceDataStatusSchema>;

export const StoredPriceHistorySchema = z
  .object({
    itemId: z.number().int().positive(),
    points: z.array(PricePointSchema),
    retrievedAt: isoDateTime,
    sourceName: z.string().min(1),
  })
  .strict();
export type StoredPriceHistory = z.infer<typeof StoredPriceHistorySchema>;

export const PriceFreshnessSchema = z
  .object({
    state: z.enum(["fresh", "stale", "unknown"]),
    timestamp: isoDateTime.optional(),
    ageSeconds: nonNegativeInteger.optional(),
  })
  .strict();
export type PriceFreshness = z.infer<typeof PriceFreshnessSchema>;

export const PriceOutlierSchema = z
  .object({
    timestamp: isoDateTime,
    price: nonNegativeInteger,
    zScore: z.number().finite(),
    direction: z.enum(["high", "low"]),
  })
  .strict();
export type PriceOutlier = z.infer<typeof PriceOutlierSchema>;

export const ItemPriceSummarySchema = z
  .object({
    itemId: z.number().int().positive(),
    name: z.string().min(1),
    range: PriceHistoryRangeSchema,
    currentPrice: nonNegativeInteger.optional(),
    firstHistoricalPrice: nonNegativeInteger.optional(),
    latestHistoricalPrice: nonNegativeInteger.optional(),
    historicalHigh: nonNegativeInteger.optional(),
    historicalLow: nonNegativeInteger.optional(),
    percentageChange: z.number().finite().optional(),
    movingAverages: z
      .object({
        days7: z.number().nonnegative().finite().optional(),
        days30: z.number().nonnegative().finite().optional(),
        days90: z.number().nonnegative().finite().optional(),
      })
      .strict(),
    volatilityPercent: z.number().nonnegative().finite().optional(),
    outliers: z.array(PriceOutlierSchema),
    priceFreshness: PriceFreshnessSchema,
    historyFreshness: PriceFreshnessSchema,
    cacheStatus: z.enum(["miss", "fresh", "stale"]),
    chart: z.array(PricePointSchema),
    unavailableFields: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
  })
  .strict();
export type ItemPriceSummary = z.infer<typeof ItemPriceSummarySchema>;

export const ValuationLineSchema = z
  .object({
    itemId: z.number().int().positive().optional(),
    requestedName: z.string().min(1).optional(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: nonNegativeInteger.optional(),
    totalPrice: nonNegativeInteger.optional(),
    priceTimestamp: isoDateTime.optional(),
    freshness: PriceFreshnessSchema,
    missingReason: z.string().min(1).optional(),
  })
  .strict();
export type ValuationLine = z.infer<typeof ValuationLineSchema>;

export const ItemListValuationSchema = z
  .object({
    items: z.array(ValuationLineSchema),
    totalValue: nonNegativeInteger,
    pricedItemCount: nonNegativeInteger,
    unpricedItemCount: nonNegativeInteger,
    complete: z.boolean(),
    valuedAt: isoDateTime,
    warnings: z.array(z.string().min(1)),
  })
  .strict();
export type ItemListValuation = z.infer<typeof ItemListValuationSchema>;

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
