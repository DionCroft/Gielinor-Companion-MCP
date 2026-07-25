import { z } from "zod";

import { GielinorErrorCodeSchema } from "./errors.js";

export const MaintenanceJobNameSchema = z.enum([
  "quest-refresh",
  "training-refresh",
  "price-refresh",
  "software-update-check",
]);
export type MaintenanceJobName = z.infer<typeof MaintenanceJobNameSchema>;

export const MaintenanceJobStateSchema = z.enum([
  "idle",
  "running",
  "backoff",
  "failed",
  "disabled",
]);
export type MaintenanceJobState = z.infer<typeof MaintenanceJobStateSchema>;

export const MaintenanceJobOutcomeSchema = z.enum([
  "success",
  "failure",
  "cancelled",
  "interrupted",
]);
export type MaintenanceJobOutcome = z.infer<typeof MaintenanceJobOutcomeSchema>;

export const MaintenanceJobDefinitionSchema = z
  .object({
    jobName: MaintenanceJobNameSchema,
    enabled: z.boolean().default(true),
    intervalMs: z
      .number()
      .int()
      .min(60_000)
      .max(30 * 24 * 60 * 60 * 1_000),
    initialNextRunAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export type MaintenanceJobDefinition = z.infer<typeof MaintenanceJobDefinitionSchema>;

export const MaintenanceJobStatusSchema = z
  .object({
    jobName: MaintenanceJobNameSchema,
    enabled: z.boolean(),
    intervalMs: z.number().int().positive(),
    lastAttemptAt: z.string().datetime({ offset: true }).optional(),
    lastSuccessAt: z.string().datetime({ offset: true }).optional(),
    nextRunAt: z.string().datetime({ offset: true }),
    failureCount: z.number().int().nonnegative(),
    lastErrorCode: GielinorErrorCodeSchema.optional(),
    state: MaintenanceJobStateSchema,
    leaseExpiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type MaintenanceJobStatus = z.infer<typeof MaintenanceJobStatusSchema>;

export const MaintenanceJobAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    jobName: MaintenanceJobNameSchema,
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }).optional(),
    outcome: MaintenanceJobOutcomeSchema.optional(),
    errorCode: GielinorErrorCodeSchema.optional(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict();
export type MaintenanceJobAttempt = z.infer<typeof MaintenanceJobAttemptSchema>;

export const DEFAULT_MAINTENANCE_JOBS: readonly MaintenanceJobDefinition[] = Object.freeze([
  {
    jobName: "quest-refresh",
    enabled: true,
    intervalMs: 24 * 60 * 60 * 1_000,
  },
  {
    jobName: "training-refresh",
    enabled: true,
    intervalMs: 24 * 60 * 60 * 1_000,
  },
  {
    jobName: "price-refresh",
    enabled: true,
    intervalMs: 6 * 60 * 60 * 1_000,
  },
  {
    jobName: "software-update-check",
    enabled: true,
    intervalMs: 24 * 60 * 60 * 1_000,
  },
]);

type CatalogueMaintenanceStatus = {
  lastSuccessfulSyncAt?: string | undefined;
};

export type CatalogueMaintenanceDefinitionsInput = {
  quests: CatalogueMaintenanceStatus;
  training: CatalogueMaintenanceStatus;
  prices: CatalogueMaintenanceStatus;
};

function nextCatalogueRun(
  lastSuccessfulSyncAt: string | undefined,
  intervalMs: number,
  now: number,
): number {
  if (lastSuccessfulSyncAt === undefined) {
    return now;
  }
  const lastSuccess = Date.parse(lastSuccessfulSyncAt);
  if (!Number.isFinite(lastSuccess)) {
    return now;
  }
  const scheduled = lastSuccess + intervalMs;
  return scheduled <= now ? now : scheduled;
}

export function catalogueMaintenanceDefinitions(
  input: CatalogueMaintenanceDefinitionsInput,
  options: {
    now?: number;
    enabled?: boolean;
    intervals?: Partial<Record<MaintenanceJobName, number>>;
  } = {},
): MaintenanceJobDefinition[] {
  const now = options.now ?? Date.now();
  const enabled = options.enabled ?? true;
  const statuses: Record<
    Extract<MaintenanceJobName, "quest-refresh" | "training-refresh" | "price-refresh">,
    CatalogueMaintenanceStatus
  > = {
    "quest-refresh": input.quests,
    "training-refresh": input.training,
    "price-refresh": input.prices,
  };
  return DEFAULT_MAINTENANCE_JOBS.map((defaultDefinition) => {
    const intervalMs =
      options.intervals?.[defaultDefinition.jobName] ?? defaultDefinition.intervalMs;
    return MaintenanceJobDefinitionSchema.parse({
      ...defaultDefinition,
      intervalMs,
      enabled,
      initialNextRunAt:
        defaultDefinition.jobName === "software-update-check"
          ? now
          : nextCatalogueRun(
              statuses[defaultDefinition.jobName].lastSuccessfulSyncAt,
              intervalMs,
              now,
            ),
    });
  });
}
