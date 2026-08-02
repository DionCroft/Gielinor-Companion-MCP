import { z } from "zod";

import {
  GameModeSchema,
  ImportableProfileExportSchema,
  PlayerProfileSchema,
  PlayStyleSchema,
  PriceHistoryRangeSchema,
  QuestStatusSchema,
  SkillIdSchema,
  TrainingStrategySchema,
} from "./schemas.js";
import {
  MarketPreferencesSchema,
  PlayerHoldingSchema,
  PlayerPrivateDataSourceSchema,
} from "./player-private-data.js";
import { MarketBacktestInputSchema } from "./market-intelligence.js";

export const EmptyInputSchema = z.object({}).strict();

export const RecoveryStatusSchema = z.enum([
  "not-required",
  "not-attempted",
  "succeeded",
  "failed",
  "partial",
]);
export type RecoveryStatus = z.infer<typeof RecoveryStatusSchema>;

export const ToolEnvelopeSchema = z
  .object({
    data: z.unknown(),
    meta: z
      .object({
        generatedAt: z.string().datetime({ offset: true }),
        source: z.string().min(1),
        traceId: z.string().uuid().optional(),
        recoveryStatus: RecoveryStatusSchema.optional(),
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
    profile: ImportableProfileExportSchema,
  })
  .strict();

export const CalculateXpRemainingToolInputSchema = z
  .object({
    currentExperience: z.number().int().min(0).max(5_800_000_000),
    targetLevel: z.number().int().min(1).max(150),
    skillId: SkillIdSchema.optional(),
  })
  .strict();

export const GetSkillProgressToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    skillId: SkillIdSchema,
    targetLevel: z.number().int().min(1).max(150),
  })
  .strict();

export const GetItemPriceToolInputSchema = z
  .object({
    itemId: z.number().int().positive(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const ItemIdentifierSchema = z.union([
  z.number().int().positive(),
  z.string().trim().min(1).max(200),
]);

export const SearchItemsToolInputSchema = z
  .object({
    query: z.string().trim().min(1).max(100),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const ItemIdentifierInputSchema = z
  .object({
    item: ItemIdentifierSchema,
  })
  .strict();

export const ItemPriceHistoryToolInputSchema = ItemIdentifierInputSchema.extend({
  range: PriceHistoryRangeSchema.optional(),
  forceRefresh: z.boolean().optional(),
}).strict();

export const CompareItemPricesToolInputSchema = z
  .object({
    items: z.array(ItemIdentifierSchema).min(1).max(20),
    range: PriceHistoryRangeSchema.optional(),
  })
  .strict();

export const ValuationItemSchema = z
  .object({
    item: ItemIdentifierSchema,
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const ValueItemListToolInputSchema = z
  .object({
    items: z.array(ValuationItemSchema).min(1).max(500),
  })
  .strict();

export const ValueEquipmentSetupToolInputSchema = z
  .object({
    items: z
      .array(
        ValuationItemSchema.extend({
          slot: z.string().trim().min(1).max(100),
        }).strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const RefreshPriceDataToolInputSchema = z
  .object({
    itemIds: z.array(z.number().int().positive()).max(20).optional(),
  })
  .strict();

export const ExportPriceDataToolInputSchema = z
  .object({
    items: z.array(ItemIdentifierSchema).min(1).max(20),
    range: PriceHistoryRangeSchema.optional(),
    format: z.enum(["json", "csv"]),
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

export const CreateQuestShoppingListToolInputSchema = ProfileQuestInputSchema.extend({
  subtractOwned: z.boolean().optional(),
}).strict();

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

export const ListTrainingMethodsToolInputSchema = z
  .object({
    skillId: SkillIdSchema.optional(),
    level: z.number().int().min(1).max(150).optional(),
    members: z.boolean().optional(),
    ironman: z.boolean().optional(),
  })
  .strict();

export const GetTrainingMethodToolInputSchema = z
  .object({
    methodId: z.string().trim().min(1).max(300),
  })
  .strict();

export const CompareTrainingMethodsToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    skillId: SkillIdSchema,
    targetLevel: z.number().int().min(1).max(150),
    methodIds: z.array(z.string().min(1).max(300)).min(1).max(100).optional(),
    members: z.boolean().optional(),
    allowVirtualLevels: z.boolean().optional(),
  })
  .strict();

export const CreateLevellingPlanToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    skillId: SkillIdSchema,
    targetLevel: z.number().int().min(1).max(150),
    strategy: TrainingStrategySchema.optional(),
    methodId: z.string().trim().min(1).max(300).optional(),
    budgetGp: z.number().int().nonnegative().optional(),
    hoursPerDay: z.number().positive().max(24).optional(),
    targetDate: z.string().datetime({ offset: true }).optional(),
    members: z.boolean().optional(),
    allowVirtualLevels: z.boolean().optional(),
  })
  .strict();

export const CreateWeeklyGoalPlanToolInputSchema = CreateLevellingPlanToolInputSchema.extend({
  weeks: z.number().int().min(1).max(520).optional(),
}).strict();

export const CalculateTrainingCostToolInputSchema = CreateLevellingPlanToolInputSchema.extend({
  materials: z.array(ValuationItemSchema).max(500).optional(),
}).strict();

export const CompareQuestXpRewardsToolInputSchema = z
  .object({
    skillId: SkillIdSchema,
    profileId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const ListRecentErrorsToolInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    activeOnly: z.boolean().optional(),
  })
  .strict();

export const ListRecoveryEventsToolInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const RetryFailedOperationToolInputSchema = z
  .object({
    operation: z.enum(["quest-refresh", "training-refresh", "price-refresh"]),
  })
  .strict();

export const RefreshStaleCataloguesToolInputSchema = z
  .object({
    catalogues: z
      .array(z.enum(["quests", "training", "prices"]))
      .min(1)
      .max(3)
      .optional(),
  })
  .strict();

export const CheckForSoftwareUpdatesToolInputSchema = z
  .object({
    includePrereleases: z.boolean().optional(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const ClearExpiredQuarantineToolInputSchema = z
  .object({
    retentionDays: z.number().int().min(1).max(3_650).optional(),
  })
  .strict();

export const ResetProviderCircuitToolInputSchema = z
  .object({
    providerId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9._-]+$/i),
    capability: z.enum([
      "player-stats",
      "current-price",
      "price-history",
      "price-snapshot",
      "quest-snapshot",
      "training-snapshot",
    ]),
    confirmed: z.literal(true),
  })
  .strict();

export const ReplacePlayerHoldingsToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    cashGp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    items: z.array(PlayerHoldingSchema).max(20_000),
    source: PlayerPrivateDataSourceSchema.optional(),
    capturedAt: z.string().datetime({ offset: true }).optional(),
    confirmReplace: z.literal(true),
  })
  .strict();

export const UpsertPlayerHoldingToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    holding: PlayerHoldingSchema,
    cashGp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    source: PlayerPrivateDataSourceSchema.optional(),
  })
  .strict();

export const ImportPlayerHoldingsToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    format: z.enum(["csv", "json"]),
    content: z
      .string()
      .min(1)
      .max(5 * 1024 * 1024),
    confirmReplace: z.literal(true),
  })
  .strict();

export const ExportPlayerHoldingsToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    format: z.enum(["csv", "json"]),
  })
  .strict();

export const RecordGeTradeToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    itemId: z.number().int().positive(),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    unitPrice: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    occurredAt: z.string().datetime({ offset: true }),
    source: PlayerPrivateDataSourceSchema,
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const ListGeTradesToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
  })
  .strict();

export const UpdateGeTradeToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    tradeId: z.string().uuid(),
    itemId: z.number().int().positive().optional(),
    side: z.enum(["buy", "sell"]).optional(),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    unitPrice: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    source: PlayerPrivateDataSourceSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).some((key) => key !== "profileId" && key !== "tradeId"), {
    message: "At least one trade field must be updated",
  });

export const RemoveGeTradeToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    tradeId: z.string().uuid(),
    confirmed: z.literal(true),
  })
  .strict();

export const CreateMarketWatchlistToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    itemIds: z.array(z.number().int().positive()).max(2_000).optional(),
  })
  .strict();

export const UpdateMarketWatchlistToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    watchlistId: z.string().uuid(),
    name: z.string().trim().min(1).max(100).optional(),
    itemIds: z.array(z.number().int().positive()).max(2_000).optional(),
  })
  .strict()
  .refine(
    (input) => Object.keys(input).some((key) => key !== "profileId" && key !== "watchlistId"),
    { message: "At least one watchlist field must be updated" },
  );

export const GetMarketWatchlistToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    watchlistId: z.string().uuid().optional(),
  })
  .strict();

export const UpdateMarketPreferencesToolInputSchema = MarketPreferencesSchema.omit({
  schemaVersion: true,
})
  .partial()
  .extend({ profileId: z.string().uuid() })
  .strict();

export const AnalyseGeItemToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    item: ItemIdentifierSchema,
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const ScanGeOpportunitiesToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    items: z.array(ItemIdentifierSchema).min(1).max(100),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const BacktestGeStrategyToolInputSchema = MarketBacktestInputSchema.extend({
  itemId: z.number().int().positive(),
  forceRefresh: z.boolean().optional(),
}).strict();

export const SetOfflineModeToolInputSchema = z
  .object({
    offline: z.boolean(),
    confirmed: z.literal(true),
  })
  .strict();

export const GetPaperPortfolioToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    initialCashGp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();

export const RecordPaperTradeToolInputSchema = z
  .object({
    profileId: z.string().uuid(),
    itemId: z.number().int().positive(),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    unitPrice: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    initialCashGp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
