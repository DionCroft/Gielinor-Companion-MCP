import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });
const gpAmount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const PlayerPrivateDataSourceSchema = z.enum([
  "manual",
  "csv-import",
  "json-import",
  "alt1-confirmed",
]);
export type PlayerPrivateDataSource = z.infer<typeof PlayerPrivateDataSourceSchema>;

export const PlayerHoldingSchema = z
  .object({
    itemId: z.number().int().positive(),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    averageAcquisitionPrice: gpAmount.optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict();
export type PlayerHolding = z.infer<typeof PlayerHoldingSchema>;

export const PlayerHoldingsSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: z.string().uuid(),
    profileId: z.string().uuid(),
    capturedAt: isoDateTime,
    source: PlayerPrivateDataSourceSchema,
    cashGp: gpAmount.optional(),
    items: z.array(PlayerHoldingSchema).max(20_000),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const seen = new Set<number>();
    for (const [index, item] of snapshot.items.entries()) {
      if (seen.has(item.itemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "itemId"],
          message: "Each item may appear only once in a holdings snapshot",
        });
      }
      seen.add(item.itemId);
    }
  });
export type PlayerHoldingsSnapshot = z.infer<typeof PlayerHoldingsSnapshotSchema>;

export const GeTradeRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    profileId: z.string().uuid(),
    itemId: z.number().int().positive(),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    unitPrice: gpAmount,
    occurredAt: isoDateTime,
    source: PlayerPrivateDataSourceSchema,
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict();
export type GeTradeRecord = z.infer<typeof GeTradeRecordSchema>;

export const MarketPreferencesSchema = z
  .object({
    schemaVersion: z.literal(1),
    riskTolerance: z.enum(["low", "medium", "high"]),
    strategy: z.enum(["trend", "mean-reversion", "balanced", "long-term"]),
    maximumAllocationPercent: z.number().finite().min(1).max(100),
    minimumVolume: z.number().int().nonnegative().optional(),
    maximumVolatility: z.number().finite().positive().max(1_000).optional(),
    minimumDataConfidence: z.number().finite().min(0).max(100),
    avoidNewOrUnstableItems: z.boolean(),
  })
  .strict();
export type MarketPreferences = z.infer<typeof MarketPreferencesSchema>;

export const DEFAULT_MARKET_PREFERENCES: MarketPreferences = Object.freeze({
  schemaVersion: 1,
  riskTolerance: "medium",
  strategy: "balanced",
  maximumAllocationPercent: 10,
  minimumDataConfidence: 60,
  avoidNewOrUnstableItems: true,
});

export const MarketWatchlistSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    profileId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    itemIds: z.array(z.number().int().positive()).max(2_000),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
  .superRefine((watchlist, context) => {
    if (new Set(watchlist.itemIds).size !== watchlist.itemIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemIds"],
        message: "A watchlist cannot contain duplicate item IDs",
      });
    }
  });
export type MarketWatchlist = z.infer<typeof MarketWatchlistSchema>;

export const SelectedPlayerSnapshotSchema = z
  .object({
    profileId: z.string().uuid(),
    selectedAt: isoDateTime,
    holdings: PlayerHoldingsSnapshotSchema.nullable(),
    marketPreferences: MarketPreferencesSchema,
  })
  .strict();
export type SelectedPlayerSnapshot = z.infer<typeof SelectedPlayerSnapshotSchema>;
