import { z } from "zod";

export const DATA_ORIGINS = [
  "live-public",
  "validated-cache",
  "manual-local",
  "imported-local",
  "alt1-confirmed",
  "derived",
  "preview-fixture",
  "unavailable",
] as const;

export const DataOriginSchema = z.enum(DATA_ORIGINS);
export type DataOrigin = z.infer<typeof DataOriginSchema>;

export const DataProvenanceSchema = z
  .object({
    origin: DataOriginSchema,
    provider: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }),
    freshness: z.enum(["fresh", "stale", "unknown", "not-applicable"]),
    cacheState: z.enum(["miss", "fresh", "stale", "not-applicable"]),
    confidence: z.number().finite().min(0).max(100).optional(),
    warnings: z.array(z.string().min(1)),
    traceId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.origin === "live-public" && value.cacheState !== "miss") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cacheState"],
        message: "Live public data must come from a current provider request, not cache",
      });
    }
    if (
      value.origin === "validated-cache" &&
      value.cacheState !== "fresh" &&
      value.cacheState !== "stale"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cacheState"],
        message: "Validated cached data must identify its cache state",
      });
    }
  });
export type DataProvenance = z.infer<typeof DataProvenanceSchema>;

export const DATA_ORIGIN_LABELS: Readonly<Record<DataOrigin, string>> = Object.freeze({
  "live-public": "Live",
  "validated-cache": "Cached",
  "manual-local": "Manual",
  "imported-local": "Imported",
  "alt1-confirmed": "Alt1 confirmed",
  derived: "Calculated",
  "preview-fixture": "Preview",
  unavailable: "Unavailable",
});
