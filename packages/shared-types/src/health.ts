import { z } from "zod";

import { GielinorErrorCodeSchema, GielinorErrorSchema } from "./errors.js";
import { MaintenanceJobStatusSchema } from "./maintenance.js";

const isoDateTime = z.string().datetime({ offset: true });

export const SystemHealthOverallSchema = z.enum([
  "healthy",
  "degraded",
  "recovering",
  "offline",
  "safe-mode",
  "critical",
]);
export type SystemHealthOverall = z.infer<typeof SystemHealthOverallSchema>;

export const ComponentHealthStateSchema = z.enum([
  "healthy",
  "degraded",
  "recovering",
  "offline",
  "safe-mode",
  "critical",
  "disabled",
  "unknown",
]);
export type ComponentHealthState = z.infer<typeof ComponentHealthStateSchema>;

export const ComponentHealthSchema = z
  .object({
    id: z.string().min(1).max(100),
    state: ComponentHealthStateSchema,
    message: z.string().min(1).max(500),
    checkedAt: isoDateTime,
    lastSuccessAt: isoDateTime.optional(),
    lastFailureAt: isoDateTime.optional(),
    errorCode: GielinorErrorCodeSchema.optional(),
  })
  .strict();
export type ComponentHealth = z.infer<typeof ComponentHealthSchema>;

export const ProviderDiagnosticHealthSchema = z
  .object({
    providerId: z.string().min(1).max(150),
    capability: z.string().min(1).max(100),
    state: z.enum(["unknown", "healthy", "degraded", "unavailable"]),
    circuitState: z.enum(["closed", "open", "half-open"]),
    successfulRequests: z.number().int().nonnegative(),
    failedRequests: z.number().int().nonnegative(),
    consecutiveFailures: z.number().int().nonnegative(),
    averageLatencyMs: z.number().nonnegative(),
    lastSuccessAt: isoDateTime.optional(),
    lastFailureAt: isoDateTime.optional(),
    nextProbeAt: isoDateTime.optional(),
    lastErrorCode: GielinorErrorCodeSchema.optional(),
  })
  .strict();
export type ProviderDiagnosticHealth = z.infer<typeof ProviderDiagnosticHealthSchema>;

export const CatalogueHealthSchema = z
  .object({
    catalogue: z.enum(["quests", "training", "prices"]),
    state: z.enum(["fresh", "stale", "missing", "failed", "refreshing", "offline"]),
    recordCount: z.number().int().nonnegative(),
    freshnessIntervalMs: z.number().int().positive(),
    ageMs: z.number().int().nonnegative().optional(),
    source: z.string().min(1).max(200).optional(),
    lastAttemptAt: isoDateTime.optional(),
    lastSuccessAt: isoDateTime.optional(),
    lastFailureAt: isoDateTime.optional(),
    nextRefreshAt: isoDateTime.optional(),
    lastErrorCode: GielinorErrorCodeSchema.optional(),
  })
  .strict();
export type CatalogueHealth = z.infer<typeof CatalogueHealthSchema>;

export const SchedulerHealthSchema = z
  .object({
    state: ComponentHealthStateSchema,
    enabled: z.boolean(),
    runningJobs: z.number().int().nonnegative(),
    failedJobs: z.number().int().nonnegative(),
    jobs: z.array(MaintenanceJobStatusSchema),
    checkedAt: isoDateTime,
  })
  .strict();
export type SchedulerHealth = z.infer<typeof SchedulerHealthSchema>;

export const RecoveryEventSchema = z
  .object({
    eventId: z.string().uuid(),
    component: z.string().min(1).max(100),
    action: z.string().min(1).max(200),
    outcome: z.enum(["succeeded", "failed", "in-progress"]),
    automatic: z.boolean(),
    occurredAt: isoDateTime,
    errorCode: GielinorErrorCodeSchema.optional(),
    traceId: z.string().uuid().optional(),
    details: z.record(z.unknown()).optional(),
  })
  .strict();
export type RecoveryEvent = z.infer<typeof RecoveryEventSchema>;

export const SystemHealthSchema = z
  .object({
    overall: SystemHealthOverallSchema,
    database: ComponentHealthSchema,
    providers: z.array(ProviderDiagnosticHealthSchema),
    catalogues: z.array(CatalogueHealthSchema),
    scheduler: SchedulerHealthSchema,
    updateChecker: ComponentHealthSchema,
    aiProviders: z.array(ProviderDiagnosticHealthSchema).optional(),
    activeErrors: z.array(GielinorErrorSchema),
    recentRecoveries: z.array(RecoveryEventSchema),
    checkedAt: isoDateTime,
  })
  .strict();
export type SystemHealth = z.infer<typeof SystemHealthSchema>;

export const RedactedDiagnosticsSchema = z
  .object({
    exportVersion: z.literal(1),
    generatedAt: isoDateTime,
    application: z
      .object({
        version: z.string().min(1),
        operatingSystem: z.string().min(1),
        architecture: z.string().min(1),
        nodeVersion: z.string().min(1),
        databaseSchemaVersion: z.number().int().nonnegative(),
        mcpContractVersion: z.string().min(1),
      })
      .strict(),
    health: SystemHealthSchema,
    configuration: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    recentErrors: z.array(GielinorErrorSchema),
    recentRecoveries: z.array(RecoveryEventSchema),
    recentLogs: z.array(z.record(z.unknown())).max(200),
    redactionNotice: z.string().min(1),
  })
  .strict();
export type RedactedDiagnostics = z.infer<typeof RedactedDiagnosticsSchema>;
