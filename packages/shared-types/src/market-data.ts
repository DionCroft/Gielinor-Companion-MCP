import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const MarketPriceObservationSchema = z
  .object({
    itemId: z.number().int().positive(),
    price: nonNegativeInteger,
    volume: nonNegativeInteger.optional(),
    timestamp: isoDateTime,
    retrievedAt: isoDateTime,
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
  })
  .strict();
export type MarketPriceObservation = z.infer<typeof MarketPriceObservationSchema>;

export const MarketHistorySeriesSchema = z
  .object({
    itemId: z.number().int().positive(),
    points: z
      .array(
        z
          .object({
            timestamp: isoDateTime,
            price: nonNegativeInteger,
            volume: nonNegativeInteger.optional(),
          })
          .strict(),
      )
      .min(1),
    retrievedAt: isoDateTime,
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
  })
  .strict();
export type MarketHistorySeries = z.infer<typeof MarketHistorySeriesSchema>;

export const RuneScapeNewsItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    url: z.string().url(),
    publishedAt: isoDateTime,
    summary: z.string().trim().min(1).optional(),
    imageUrl: z.string().url().optional(),
    sourceName: z.string().min(1),
    retrievedAt: isoDateTime,
    tags: z.array(z.string().trim().min(1)).max(50),
  })
  .strict();
export type RuneScapeNewsItem = z.infer<typeof RuneScapeNewsItemSchema>;

export const RuneScapeNewsSnapshotSchema = z
  .object({
    items: z.array(RuneScapeNewsItemSchema).max(1_000),
    retrievedAt: isoDateTime,
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
  })
  .strict();
export type RuneScapeNewsSnapshot = z.infer<typeof RuneScapeNewsSnapshotSchema>;
