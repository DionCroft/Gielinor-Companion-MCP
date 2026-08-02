import { arch, platform } from "node:os";

import {
  SystemHealthService,
  type GrandExchangeService,
  type LevellingPlannerService,
  type QuestService,
  type SystemHealthSnapshot,
} from "@gielinor/core";
import {
  DATABASE_SCHEMA_VERSION,
  type SqliteDiagnosticsRepository,
  type DatabaseConnection,
  type DatabaseRecoveryState,
  type MaintenanceRunResult,
} from "@gielinor/database";
import {
  APPLICATION_VERSION,
  createTraceId,
  mapLegacyErrorCode,
  ProviderDiagnosticHealthSchema,
  RedactedDiagnosticsSchema,
  sanitisePublicDetails,
  type CatalogueHealth,
  type ComponentHealth,
  type GielinorError,
  type MaintenanceJobStatus,
  type MaintenanceJobName,
  type ProviderDiagnosticHealth,
  type RecoveryEvent,
  type RedactedDiagnostics,
  type SchedulerHealth,
  type SystemHealth,
  type SoftwareUpdateCheck,
} from "@gielinor/shared-types";
import {
  PROVIDER_CAPABILITIES,
  type CacheStore,
  type ProviderCapability,
  type ProviderRegistry,
} from "@gielinor/providers";

import type {
  CatalogueMaintenanceRuntime,
  MaintenanceRuntimePolicy,
} from "./maintenance-runtime.js";
import type { SoftwareUpdateCheckOptions, SoftwareUpdateService } from "./update-service.js";

type ScalarConfiguration = Record<string, string | number | boolean | null>;

export type RuntimeDiagnosticsServiceOptions = {
  database: DatabaseConnection;
  databaseRecovery: DatabaseRecoveryState;
  providerRegistry: ProviderRegistry;
  cacheStore: CacheStore;
  quests: QuestService;
  planner: LevellingPlannerService;
  exchange: GrandExchangeService;
  maintenance?: CatalogueMaintenanceRuntime | undefined;
  maintenancePolicy: MaintenanceRuntimePolicy;
  updateChecker?: SoftwareUpdateService | undefined;
  offline: boolean | (() => boolean);
  repository?: SqliteDiagnosticsRepository | undefined;
  configuration?: ScalarConfiguration | undefined;
  recentLogs?: (() => Record<string, unknown>[]) | undefined;
  now?: (() => number) | undefined;
};

function timestamp(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function databaseHealth(recovery: DatabaseRecoveryState, checkedAt: string): ComponentHealth {
  const state =
    recovery.status === "safe-mode"
      ? "safe-mode"
      : recovery.status === "recovered"
        ? "degraded"
        : "healthy";
  return {
    id: "database",
    state,
    message:
      recovery.status === "ready"
        ? "SQLite integrity and schema are ready"
        : recovery.status === "recovered"
          ? "SQLite recovered automatically and preserved the original"
          : "SQLite is restricted to read-only safe mode",
    checkedAt,
    ...(recovery.error === undefined ? {} : { errorCode: recovery.error.code }),
    ...(recovery.error === undefined ? {} : { lastFailureAt: recovery.error.timestamp }),
    ...(recovery.status === "safe-mode" ? {} : { lastSuccessAt: recovery.checkedAt }),
  };
}

function providerHealth(registry: ProviderRegistry): ProviderDiagnosticHealth[] {
  const circuits = new Map(
    registry.circuits
      .snapshot()
      .map((circuit) => [`${circuit.providerId}:${circuit.capability}`, circuit]),
  );
  return registry.health.snapshot().map((health) => {
    const circuit = circuits.get(`${health.pluginId}:${health.capability}`);
    return ProviderDiagnosticHealthSchema.parse({
      providerId: health.pluginId,
      capability: health.capability,
      state: health.state,
      circuitState: circuit?.state ?? "closed",
      successfulRequests: health.successfulRequests,
      failedRequests: health.failedRequests,
      consecutiveFailures: health.consecutiveFailures,
      averageLatencyMs: health.averageLatencyMs,
      ...(health.lastSuccessAt === undefined ? {} : { lastSuccessAt: health.lastSuccessAt }),
      ...(health.lastFailureAt === undefined ? {} : { lastFailureAt: health.lastFailureAt }),
      ...(circuit?.nextProbeAt === undefined ? {} : { nextProbeAt: circuit.nextProbeAt }),
      ...(health.lastErrorCode === undefined
        ? {}
        : { lastErrorCode: mapLegacyErrorCode(health.lastErrorCode, "GC-PROVIDER-001") }),
    });
  });
}

function schedulerHealth(
  jobs: MaintenanceJobStatus[],
  offline: boolean,
  checkedAt: string,
): SchedulerHealth {
  const runningJobs = jobs.filter((job) => job.state === "running").length;
  const failedJobs = jobs.filter((job) => job.failureCount > 0).length;
  const enabled = jobs.some((job) => job.enabled);
  return {
    state: offline
      ? "offline"
      : runningJobs > 0
        ? "recovering"
        : failedJobs > 0
          ? "degraded"
          : enabled
            ? "healthy"
            : "disabled",
    enabled,
    runningJobs,
    failedJobs,
    jobs,
    checkedAt,
  };
}

export class RuntimeDiagnosticsService {
  private readonly now: () => number;
  private readonly repository: SqliteDiagnosticsRepository | undefined;
  private readonly systemHealth: SystemHealthService;

  public constructor(private readonly options: RuntimeDiagnosticsServiceOptions) {
    this.now = options.now ?? Date.now;
    this.repository = options.repository;
    this.systemHealth = new SystemHealthService(
      {
        snapshot: () => this.snapshot(),
      },
      () => new Date(this.now()),
    );
  }

  private isOffline(): boolean {
    return typeof this.options.offline === "function"
      ? this.options.offline()
      : this.options.offline;
  }

  public getSystemHealth(): Promise<SystemHealth> {
    return this.systemHealth.getHealth();
  }

  public getProviderHealth(): ProviderDiagnosticHealth[] {
    return providerHealth(this.options.providerRegistry);
  }

  public async getCatalogueHealth(): Promise<CatalogueHealth[]> {
    const [quests, training, prices] = await Promise.all([
      this.options.quests.getDataStatus(),
      this.options.planner.getDataStatus(),
      this.options.exchange.getDataStatus(),
    ]);
    const jobs = new Map(
      (this.options.maintenance?.status() ?? []).map((job) => [job.jobName, job]),
    );
    return [
      this.catalogue(
        "quests",
        quests,
        quests.questCount,
        this.options.maintenancePolicy.intervals["quest-refresh"],
        jobs.get("quest-refresh"),
      ),
      this.catalogue(
        "training",
        training,
        training.methodCount,
        this.options.maintenancePolicy.intervals["training-refresh"],
        jobs.get("training-refresh"),
      ),
      this.catalogue(
        "prices",
        prices,
        prices.itemCount,
        this.options.maintenancePolicy.intervals["price-refresh"],
        jobs.get("price-refresh"),
      ),
    ];
  }

  public listRecentErrors(limit = 50, activeOnly = false): GielinorError[] {
    return this.repository?.listErrors({ limit, activeOnly }) ?? [];
  }

  public listRecoveryEvents(limit = 50): RecoveryEvent[] {
    if (this.repository === undefined) {
      return [];
    }
    return [
      ...this.repository.listRecoveries(limit),
      ...this.repository.listDatabaseRecoveries(limit),
    ]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);
  }

  public recordError(error: GielinorError): void {
    this.repository?.recordError(error);
  }

  public async retryFailedOperation(
    operation: Exclude<MaintenanceJobName, "software-update-check">,
  ): Promise<MaintenanceRunResult> {
    if (this.options.maintenance === undefined) {
      return { status: "skipped", jobName: operation, reason: "disabled-or-not-due" };
    }
    const eventId = createTraceId();
    const occurredAt = new Date(this.now()).toISOString();
    this.repository?.recordRecovery({
      eventId,
      component: "scheduler",
      action: `Manually retry ${operation}`,
      outcome: "in-progress",
      automatic: false,
      occurredAt,
      traceId: eventId,
    });
    const result = await this.options.maintenance.runNow(operation);
    this.repository?.recordRecovery({
      eventId,
      component: "scheduler",
      action: `Manually retry ${operation}`,
      outcome: result.status === "success" ? "succeeded" : "failed",
      automatic: false,
      occurredAt,
      traceId: eventId,
      ...(result.status === "failed" ? { errorCode: result.errorCode } : {}),
      details: { result },
    });
    return result;
  }

  public async refreshStaleCatalogues(
    requested?: Array<"quests" | "training" | "prices">,
  ): Promise<{
    results: MaintenanceRunResult[];
    refreshed: Array<"quests" | "training" | "prices">;
    alreadyFresh: Array<"quests" | "training" | "prices">;
  }> {
    const allowed = new Set(requested ?? ["quests", "training", "prices"]);
    const health = await this.getCatalogueHealth();
    const stale = health
      .filter(
        (catalogue) =>
          allowed.has(catalogue.catalogue) &&
          ["stale", "missing", "failed"].includes(catalogue.state),
      )
      .map((catalogue) => catalogue.catalogue);
    const alreadyFresh = health
      .filter(
        (catalogue) =>
          allowed.has(catalogue.catalogue) &&
          !["stale", "missing", "failed"].includes(catalogue.state),
      )
      .map((catalogue) => catalogue.catalogue);
    if (this.options.maintenance === undefined) {
      return { results: [], refreshed: [], alreadyFresh };
    }
    const jobFor = {
      quests: "quest-refresh",
      training: "training-refresh",
      prices: "price-refresh",
    } as const;
    const results = await Promise.all(
      stale.map((catalogue) => this.options.maintenance!.runNow(jobFor[catalogue])),
    );
    return { results, refreshed: stale, alreadyFresh };
  }

  public async checkForSoftwareUpdates(
    options: SoftwareUpdateCheckOptions = {},
  ): Promise<SoftwareUpdateCheck> {
    if (this.options.updateChecker !== undefined) {
      return this.options.updateChecker.check(options);
    }
    const checkedAt = new Date(this.now()).toISOString();
    return {
      state: "disabled",
      installedVersion: APPLICATION_VERSION,
      checkedAt,
      source: "none",
      message: "Read-only software update checks are not configured",
      warnings: [],
      traceId: createTraceId(),
    };
  }

  public async clearExpiredQuarantineRecords(retentionDays = 30): Promise<{
    deleted: number;
    cutoffAt: string;
    retentionDays: number;
  }> {
    const cutoffAtMs = this.now() - retentionDays * 24 * 60 * 60_000;
    const deleted = await this.options.cacheStore.clearExpiredQuarantine(cutoffAtMs);
    const eventId = createTraceId();
    const occurredAt = new Date(this.now()).toISOString();
    this.repository?.recordRecovery({
      eventId,
      component: "cache",
      action: "Cleared expired quarantine records",
      outcome: "succeeded",
      automatic: false,
      occurredAt,
      traceId: eventId,
      details: { deleted, retentionDays },
    });
    return {
      deleted,
      cutoffAt: new Date(cutoffAtMs).toISOString(),
      retentionDays,
    };
  }

  public resetProviderCircuit(
    providerId: string,
    capability: string,
  ): {
    providerId: string;
    capability: string;
    resetCount: number;
    state: "closed";
  } {
    const supported = (PROVIDER_CAPABILITIES as readonly string[]).includes(capability);
    const resetCount = supported
      ? this.options.providerRegistry.circuits.reset(providerId, capability as ProviderCapability)
      : 0;
    const eventId = createTraceId();
    this.repository?.recordRecovery({
      eventId,
      component: "provider",
      action: "Reset one provider circuit after explicit confirmation",
      outcome: "succeeded",
      automatic: false,
      occurredAt: new Date(this.now()).toISOString(),
      traceId: eventId,
      details: { providerId, capability, resetCount },
    });
    return { providerId, capability, resetCount, state: "closed" };
  }

  public runDatabaseIntegrityCheck(): ComponentHealth {
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const result = this.options.database.pragma("quick_check", { simple: true });
      if (result !== "ok") {
        return {
          id: "database",
          state: "critical",
          message: "SQLite integrity check did not return a valid result",
          checkedAt,
          lastFailureAt: checkedAt,
          errorCode: "GC-DB-004",
        };
      }
      return {
        id: "database",
        state: this.options.databaseRecovery.status === "safe-mode" ? "safe-mode" : "healthy",
        message: "SQLite quick integrity check passed",
        checkedAt,
        lastSuccessAt: checkedAt,
      };
    } catch {
      return {
        id: "database",
        state: "critical",
        message: "SQLite integrity check could not be completed",
        checkedAt,
        lastFailureAt: checkedAt,
        errorCode: "GC-DB-001",
      };
    }
  }

  public async exportRedactedDiagnostics(): Promise<RedactedDiagnostics> {
    const health = await this.getSystemHealth();
    const logs = (this.options.recentLogs?.() ?? [])
      .slice(-200)
      .map((entry) => sanitisePublicDetails(entry));
    return RedactedDiagnosticsSchema.parse({
      exportVersion: 1,
      generatedAt: new Date(this.now()).toISOString(),
      application: {
        version: APPLICATION_VERSION,
        operatingSystem: platform(),
        architecture: arch(),
        nodeVersion: process.version,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
        mcpContractVersion: "1.1",
      },
      health,
      configuration: this.safeConfiguration(),
      recentErrors: this.listRecentErrors(100),
      recentRecoveries: this.listRecoveryEvents(100),
      recentLogs: logs,
      redactionNotice:
        "Secrets, credentials, private headers, personal identifiers, raw payloads, prompts, and absolute paths are excluded or redacted.",
    });
  }

  private async snapshot(): Promise<SystemHealthSnapshot> {
    const checkedAt = new Date(this.now()).toISOString();
    const [catalogues, providers, updateChecker] = await Promise.all([
      this.getCatalogueHealth(),
      Promise.resolve(this.getProviderHealth()),
      this.options.updateChecker?.getHealth() ??
        Promise.resolve({
          id: "update-checker",
          state: "disabled" as const,
          message: "The read-only update checker is not connected yet",
          checkedAt,
        }),
    ]);
    const jobs = this.options.maintenance?.status() ?? [];
    return {
      database: databaseHealth(this.options.databaseRecovery, checkedAt),
      providers,
      catalogues,
      scheduler: schedulerHealth(jobs, this.isOffline(), checkedAt),
      updateChecker,
      activeErrors: this.listRecentErrors(50, true),
      recentRecoveries: this.listRecoveryEvents(50),
      offline: this.isOffline(),
    };
  }

  private catalogue(
    catalogue: CatalogueHealth["catalogue"],
    status: {
      state: "never-synced" | "ready" | "failed";
      provider?: string | undefined;
      lastAttemptAt?: string | undefined;
      lastSuccessfulSyncAt?: string | undefined;
      lastErrorCode?: string | undefined;
    },
    recordCount: number,
    freshnessIntervalMs: number,
    job: MaintenanceJobStatus | undefined,
  ): CatalogueHealth {
    const now = this.now();
    const lastSuccess = timestamp(status.lastSuccessfulSyncAt);
    const ageMs = lastSuccess === undefined ? undefined : Math.max(0, now - lastSuccess);
    const state: CatalogueHealth["state"] =
      job?.state === "running"
        ? "refreshing"
        : this.isOffline() && recordCount > 0
          ? "offline"
          : recordCount === 0
            ? status.state === "failed"
              ? "failed"
              : "missing"
            : status.state === "failed" || (ageMs !== undefined && ageMs > freshnessIntervalMs)
              ? "stale"
              : "fresh";
    return {
      catalogue,
      state,
      recordCount,
      freshnessIntervalMs,
      ...(ageMs === undefined ? {} : { ageMs }),
      ...(status.provider === undefined ? {} : { source: status.provider }),
      ...(status.lastAttemptAt === undefined ? {} : { lastAttemptAt: status.lastAttemptAt }),
      ...(status.lastSuccessfulSyncAt === undefined
        ? {}
        : { lastSuccessAt: status.lastSuccessfulSyncAt }),
      ...(status.state !== "failed" || status.lastAttemptAt === undefined
        ? {}
        : { lastFailureAt: status.lastAttemptAt }),
      ...(job === undefined ? {} : { nextRefreshAt: job.nextRunAt }),
      ...(status.lastErrorCode === undefined
        ? {}
        : { lastErrorCode: mapLegacyErrorCode(status.lastErrorCode, "GC-SYNC-001") }),
    };
  }

  private safeConfiguration(): ScalarConfiguration {
    const safe: ScalarConfiguration = {};
    for (const [key, value] of Object.entries(this.options.configuration ?? {})) {
      if (
        !/(?:token|secret|password|credential|authorization|cookie|path|url|name|email)/i.test(key)
      ) {
        safe[key] = value;
      }
    }
    safe.offline = this.isOffline();
    safe.automaticRefreshEnabled = this.options.maintenancePolicy.automaticRefreshEnabled;
    safe.refreshOnStartup = this.options.maintenancePolicy.refreshOnStartup;
    safe.backgroundRefresh = this.options.maintenancePolicy.backgroundRefresh;
    safe.maintenanceConcurrency = this.options.maintenancePolicy.concurrency;
    return safe;
  }
}
