import type { GrandExchangeService, LevellingPlannerService, QuestService } from "@gielinor/core";
import {
  PersistentScheduler,
  SqliteMaintenanceJobRepository,
  type DatabaseConnection,
  type MaintenanceRunResult,
  type SqliteDiagnosticsRepository,
} from "@gielinor/database";
import {
  catalogueMaintenanceDefinitions,
  createTraceId,
  GielinorErrorException,
  MaintenanceJobDefinitionSchema,
  type MaintenanceJobName,
  type MaintenanceJobStatus,
} from "@gielinor/shared-types";
import { z } from "zod";

import type { SoftwareUpdateService } from "./update-service.js";

const BooleanEnvironmentSchema = z
  .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
  .transform((value) => ["true", "1", "yes", "on"].includes(value));

function environmentBoolean(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const value = environment[name];
  return value === undefined
    ? fallback
    : BooleanEnvironmentSchema.parse(value.trim().toLocaleLowerCase());
}

function environmentInterval(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = z.coerce.number().parse(environment[name] ?? fallback);
  return MaintenanceJobDefinitionSchema.shape.intervalMs.parse(value);
}

export type MaintenanceRuntimePolicy = {
  automaticRefreshEnabled: boolean;
  refreshOnStartup: boolean;
  backgroundRefresh: boolean;
  concurrency: number;
  maximumRecoveryAttempts: number;
  intervals: Record<MaintenanceJobName, number>;
};

export function loadMaintenanceRuntimePolicy(
  environment: NodeJS.ProcessEnv = process.env,
): MaintenanceRuntimePolicy {
  return {
    automaticRefreshEnabled: environmentBoolean(environment, "GIELINOR_MAINTENANCE_ENABLED", true),
    refreshOnStartup: environmentBoolean(environment, "GIELINOR_REFRESH_ON_STARTUP", true),
    backgroundRefresh: environmentBoolean(environment, "GIELINOR_BACKGROUND_REFRESH", true),
    concurrency: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .parse(environment.GIELINOR_MAINTENANCE_CONCURRENCY ?? 3),
    maximumRecoveryAttempts: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .parse(environment.GIELINOR_MAINTENANCE_MAX_RECOVERY_ATTEMPTS ?? 5),
    intervals: {
      "quest-refresh": environmentInterval(
        environment,
        "GIELINOR_QUEST_REFRESH_MS",
        24 * 60 * 60_000,
      ),
      "training-refresh": environmentInterval(
        environment,
        "GIELINOR_TRAINING_REFRESH_MS",
        24 * 60 * 60_000,
      ),
      "price-refresh": environmentInterval(
        environment,
        "GIELINOR_PRICE_CATALOGUE_REFRESH_MS",
        6 * 60 * 60_000,
      ),
      "software-update-check": environmentInterval(
        environment,
        "GIELINOR_UPDATE_CHECK_MS",
        24 * 60 * 60_000,
      ),
    },
  };
}

export type CatalogueMaintenanceRuntime = {
  repository: SqliteMaintenanceJobRepository;
  scheduler: PersistentScheduler;
  start(): void;
  stop(): Promise<void>;
  status(): MaintenanceJobStatus[];
  runDue(): Promise<MaintenanceRunResult[]>;
  runNow(jobName: MaintenanceJobName): Promise<MaintenanceRunResult>;
};

export async function createCatalogueMaintenanceRuntime(input: {
  database: DatabaseConnection;
  quests: QuestService;
  planner: LevellingPlannerService;
  exchange: GrandExchangeService;
  offline?: boolean;
  diagnostics?: SqliteDiagnosticsRepository | undefined;
  updateChecker?: SoftwareUpdateService | undefined;
  policy?: MaintenanceRuntimePolicy | undefined;
  now?: (() => number) | undefined;
}): Promise<CatalogueMaintenanceRuntime> {
  const now = input.now ?? Date.now;
  const policy = input.policy ?? loadMaintenanceRuntimePolicy();
  const [quests, training, prices] = await Promise.all([
    input.quests.getDataStatus(),
    input.planner.getDataStatus(),
    input.exchange.getDataStatus(),
  ]);
  const definitions = catalogueMaintenanceDefinitions(
    { quests, training, prices },
    {
      now: now(),
      enabled: policy.automaticRefreshEnabled && !(input.offline ?? false),
      intervals: policy.intervals,
    },
  ).map((definition) =>
    definition.jobName === "software-update-check"
      ? {
          ...definition,
          enabled: definition.enabled && (input.updateChecker?.enabled ?? false),
        }
      : definition,
  );
  const repository = new SqliteMaintenanceJobRepository(input.database);
  const scheduler = new PersistentScheduler(
    repository,
    {
      "quest-refresh": async (signal) => {
        signal.throwIfAborted();
        await input.quests.refreshData();
      },
      "training-refresh": async (signal) => {
        signal.throwIfAborted();
        await input.planner.refreshData();
      },
      "price-refresh": async (signal) => {
        signal.throwIfAborted();
        await input.exchange.refreshData();
      },
      ...(input.updateChecker === undefined
        ? {}
        : {
            "software-update-check": async (signal: AbortSignal) => {
              signal.throwIfAborted();
              const result = await input.updateChecker!.check({ forceRefresh: true });
              if (
                result.state === "unable-to-check" ||
                result.state === "invalid-release-metadata"
              ) {
                throw new GielinorErrorException(result.errorCode ?? "GC-UPDATE-001", {
                  message: result.message,
                  traceId: result.traceId,
                  source: "software-update-checker",
                  operation: "scheduled-update-check",
                });
              }
            },
          }),
    },
    {
      now,
      networkAllowed: () => !(input.offline ?? false),
      concurrency: policy.concurrency,
      maximumRecoveryAttempts: policy.maximumRecoveryAttempts,
      onError: (error) => input.diagnostics?.recordError(error),
      onRecovery: (jobName, previousFailureCount) =>
        input.diagnostics?.recordRecovery({
          eventId: createTraceId(),
          component: "scheduler",
          action: `Recovered ${jobName}`,
          outcome: "succeeded",
          automatic: true,
          occurredAt: new Date(now()).toISOString(),
          details: { jobName, previousFailureCount },
        }),
    },
  );
  const recoveredLeases = scheduler.initialize(definitions);
  if (recoveredLeases > 0) {
    input.diagnostics?.recordRecovery({
      eventId: createTraceId(),
      component: "scheduler",
      action: "Recovered interrupted maintenance leases",
      outcome: "succeeded",
      automatic: true,
      occurredAt: new Date(now()).toISOString(),
      errorCode: "GC-SCHED-002",
      details: { recoveredLeases },
    });
  }
  for (const definition of definitions) {
    if (definition.initialNextRunAt !== undefined && definition.initialNextRunAt > now()) {
      repository.deferUntil(definition.jobName, definition.initialNextRunAt, now());
    }
  }
  return {
    repository,
    scheduler,
    start: () =>
      scheduler.start({
        runImmediately: policy.refreshOnStartup,
        background: policy.backgroundRefresh,
      }),
    stop: () => scheduler.stop(),
    status: () => repository.list(),
    runDue: () => scheduler.runDue(),
    runNow: (jobName) => scheduler.runNow(jobName),
  };
}
