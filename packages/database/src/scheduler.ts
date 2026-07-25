import { randomUUID } from "node:crypto";

import {
  GielinorErrorCodeSchema,
  MaintenanceJobAttemptSchema,
  MaintenanceJobDefinitionSchema,
  MaintenanceJobNameSchema,
  MaintenanceJobStatusSchema,
  toGielinorError,
  type GielinorError,
  type GielinorErrorCode,
  type MaintenanceJobAttempt,
  type MaintenanceJobDefinition,
  type MaintenanceJobName,
  type MaintenanceJobOutcome,
  type MaintenanceJobStatus,
} from "@gielinor/shared-types";

import type { DatabaseConnection } from "./connection.js";

type JobRow = {
  job_name: string;
  enabled: number;
  interval_ms: number;
  last_attempt_at: number | null;
  last_success_at: number | null;
  next_run_at: number;
  failure_count: number;
  last_error_code: string | null;
  state: string;
  lease_owner: string | null;
  lease_expires_at: number | null;
};

type AttemptRow = {
  attempt_id: string;
  job_name: string;
  started_at: number;
  completed_at: number | null;
  outcome: string | null;
  error_code: string | null;
  duration_ms: number | null;
};

export type ClaimedMaintenanceJob = {
  attemptId: string;
  jobName: MaintenanceJobName;
  ownerId: string;
  intervalMs: number;
  failureCount: number;
  leaseExpiresAt: number;
};

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function jobStatus(row: JobRow): MaintenanceJobStatus {
  return MaintenanceJobStatusSchema.parse({
    jobName: row.job_name,
    enabled: row.enabled === 1,
    intervalMs: row.interval_ms,
    ...(row.last_attempt_at === null ? {} : { lastAttemptAt: iso(row.last_attempt_at) }),
    ...(row.last_success_at === null ? {} : { lastSuccessAt: iso(row.last_success_at) }),
    nextRunAt: iso(row.next_run_at),
    failureCount: row.failure_count,
    ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
    state: row.enabled === 0 ? "disabled" : row.state,
    ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: iso(row.lease_expires_at) }),
  });
}

function attempt(row: AttemptRow): MaintenanceJobAttempt {
  return MaintenanceJobAttemptSchema.parse({
    attemptId: row.attempt_id,
    jobName: row.job_name,
    startedAt: iso(row.started_at),
    ...(row.completed_at === null ? {} : { completedAt: iso(row.completed_at) }),
    ...(row.outcome === null ? {} : { outcome: row.outcome }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
  });
}

export class SqliteMaintenanceJobRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public initialize(definitions: readonly MaintenanceJobDefinition[], now = Date.now()): void {
    this.ensureSchema();
    const insert = this.database.prepare(`
      INSERT INTO maintenance_jobs (
        job_name,
        enabled,
        interval_ms,
        next_run_at,
        state,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_name) DO NOTHING
    `);
    this.database.transaction(() => {
      for (const definitionInput of definitions) {
        const definition = MaintenanceJobDefinitionSchema.parse(definitionInput);
        insert.run(
          definition.jobName,
          definition.enabled ? 1 : 0,
          definition.intervalMs,
          definition.initialNextRunAt ?? now,
          definition.enabled ? "idle" : "disabled",
          now,
        );
      }
    })();
  }

  public recoverExpiredLeases(now = Date.now(), retryAt = now + 60_000): number {
    this.ensureSchema();
    return this.database.transaction(() => {
      const expired = this.database
        .prepare(
          `SELECT job_name
           FROM maintenance_jobs
           WHERE state = 'running' AND lease_expires_at <= ?`,
        )
        .all(now) as { job_name: string }[];
      if (expired.length === 0) {
        return 0;
      }
      this.database
        .prepare(
          `UPDATE maintenance_job_attempts
           SET completed_at = ?,
               outcome = 'interrupted',
               error_code = 'GC-SCHED-002',
               duration_ms = MAX(0, ? - started_at)
           WHERE completed_at IS NULL
             AND job_name IN (
               SELECT job_name
               FROM maintenance_jobs
               WHERE state = 'running' AND lease_expires_at <= ?
             )`,
        )
        .run(now, now, now);
      const result = this.database
        .prepare(
          `UPDATE maintenance_jobs
           SET state = CASE WHEN enabled = 1 THEN 'backoff' ELSE 'disabled' END,
               lease_owner = NULL,
               lease_expires_at = NULL,
               failure_count = failure_count + 1,
               last_error_code = 'GC-SCHED-002',
               next_run_at = CASE WHEN next_run_at < ? THEN ? ELSE next_run_at END,
               updated_at = ?
           WHERE state = 'running' AND lease_expires_at <= ?`,
        )
        .run(retryAt, retryAt, now, now);
      return result.changes;
    })();
  }

  public list(): MaintenanceJobStatus[] {
    this.ensureSchema();
    const rows = this.database
      .prepare("SELECT * FROM maintenance_jobs ORDER BY job_name")
      .all() as JobRow[];
    return rows.map(jobStatus);
  }

  public get(jobNameInput: MaintenanceJobName): MaintenanceJobStatus | undefined {
    this.ensureSchema();
    const jobName = MaintenanceJobNameSchema.parse(jobNameInput);
    const row = this.database
      .prepare("SELECT * FROM maintenance_jobs WHERE job_name = ?")
      .get(jobName) as JobRow | undefined;
    return row === undefined ? undefined : jobStatus(row);
  }

  public due(now = Date.now(), limit = 100): MaintenanceJobName[] {
    this.ensureSchema();
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT job_name
         FROM maintenance_jobs
         WHERE enabled = 1
           AND state != 'failed'
           AND next_run_at <= ?
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
         ORDER BY next_run_at, job_name
         LIMIT ?`,
      )
      .all(now, now, boundedLimit) as { job_name: string }[];
    return rows.map((row) => MaintenanceJobNameSchema.parse(row.job_name));
  }

  public claim(
    jobNameInput: MaintenanceJobName,
    ownerId: string,
    now = Date.now(),
    leaseDurationMs = 5 * 60_000,
    force = false,
  ): ClaimedMaintenanceJob | undefined {
    this.ensureSchema();
    const jobName = MaintenanceJobNameSchema.parse(jobNameInput);
    const attemptId = randomUUID();
    const leaseExpiresAt = now + leaseDurationMs;
    return this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE maintenance_jobs
           SET state = 'running',
               lease_owner = ?,
               lease_expires_at = ?,
               last_attempt_at = ?,
               updated_at = ?
           WHERE job_name = ?
             AND enabled = 1
             AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
             AND (? = 1 OR next_run_at <= ?)`,
        )
        .run(ownerId, leaseExpiresAt, now, now, jobName, now, force ? 1 : 0, now);
      if (result.changes !== 1) {
        return undefined;
      }
      const row = this.database
        .prepare(
          `SELECT interval_ms, failure_count
           FROM maintenance_jobs
           WHERE job_name = ? AND lease_owner = ?`,
        )
        .get(jobName, ownerId) as { interval_ms: number; failure_count: number } | undefined;
      if (row === undefined) {
        return undefined;
      }
      this.database
        .prepare(
          `INSERT INTO maintenance_job_attempts (
             attempt_id, job_name, started_at
           ) VALUES (?, ?, ?)`,
        )
        .run(attemptId, jobName, now);
      return {
        attemptId,
        jobName,
        ownerId,
        intervalMs: row.interval_ms,
        failureCount: row.failure_count,
        leaseExpiresAt,
      };
    })();
  }

  public renewLease(
    claim: ClaimedMaintenanceJob,
    now = Date.now(),
    leaseDurationMs = 5 * 60_000,
  ): boolean {
    const result = this.database
      .prepare(
        `UPDATE maintenance_jobs
         SET lease_expires_at = ?, updated_at = ?
         WHERE job_name = ?
           AND state = 'running'
           AND lease_owner = ?
           AND lease_expires_at > ?`,
      )
      .run(now + leaseDurationMs, now, claim.jobName, claim.ownerId, now);
    return result.changes === 1;
  }

  public completeSuccess(claim: ClaimedMaintenanceJob, now = Date.now()): boolean {
    return this.complete(claim, "success", undefined, now, now + claim.intervalMs);
  }

  public completeFailure(
    claim: ClaimedMaintenanceJob,
    errorCodeInput: GielinorErrorCode,
    nextRunAt: number,
    now = Date.now(),
    outcome: Extract<MaintenanceJobOutcome, "failure" | "cancelled"> = "failure",
    permanent = false,
  ): boolean {
    const errorCode = GielinorErrorCodeSchema.parse(errorCodeInput);
    return this.complete(claim, outcome, errorCode, now, nextRunAt, permanent);
  }

  public setEnabled(jobNameInput: MaintenanceJobName, enabled: boolean, now = Date.now()): boolean {
    const jobName = MaintenanceJobNameSchema.parse(jobNameInput);
    const result = this.database
      .prepare(
        `UPDATE maintenance_jobs
         SET enabled = ?,
             state = CASE
               WHEN ? = 0 THEN 'disabled'
               WHEN state = 'disabled' THEN 'idle'
               ELSE state
             END,
             next_run_at = CASE WHEN ? = 1 AND enabled = 0 THEN ? ELSE next_run_at END,
             updated_at = ?
         WHERE job_name = ? AND state != 'running'`,
      )
      .run(enabled ? 1 : 0, enabled ? 1 : 0, enabled ? 1 : 0, now, now, jobName);
    return result.changes === 1;
  }

  public setInterval(
    jobNameInput: MaintenanceJobName,
    intervalMs: number,
    now = Date.now(),
  ): boolean {
    const parsed = MaintenanceJobDefinitionSchema.shape.intervalMs.parse(intervalMs);
    const jobName = MaintenanceJobNameSchema.parse(jobNameInput);
    const result = this.database
      .prepare(
        `UPDATE maintenance_jobs
         SET interval_ms = ?,
             next_run_at = CASE
               WHEN last_success_at IS NULL THEN next_run_at
               ELSE MIN(next_run_at, last_success_at + ?)
             END,
             updated_at = ?
         WHERE job_name = ?`,
      )
      .run(parsed, parsed, now, jobName);
    return result.changes === 1;
  }

  public makeDue(jobNamesInput: readonly MaintenanceJobName[], now = Date.now()): number {
    const jobNames = [
      ...new Set(jobNamesInput.map((name) => MaintenanceJobNameSchema.parse(name))),
    ];
    if (jobNames.length === 0) {
      return 0;
    }
    const update = this.database.prepare(
      `UPDATE maintenance_jobs
       SET next_run_at = ?, updated_at = ?
       WHERE job_name = ? AND enabled = 1 AND state != 'running'`,
    );
    return this.database.transaction(() =>
      jobNames.reduce((count, name) => count + update.run(now, now, name).changes, 0),
    )();
  }

  public deferUntil(
    jobNameInput: MaintenanceJobName,
    nextRunAt: number,
    now = Date.now(),
  ): boolean {
    const jobName = MaintenanceJobNameSchema.parse(jobNameInput);
    const parsedNextRunAt = zSafeEpoch(nextRunAt);
    const result = this.database
      .prepare(
        `UPDATE maintenance_jobs
         SET next_run_at = MAX(next_run_at, ?), updated_at = ?
         WHERE job_name = ? AND state != 'running'`,
      )
      .run(parsedNextRunAt, now, jobName);
    return result.changes === 1;
  }

  public recentAttempts(limit = 50): MaintenanceJobAttempt[] {
    this.ensureSchema();
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT *
         FROM maintenance_job_attempts
         ORDER BY started_at DESC, attempt_id
         LIMIT ?`,
      )
      .all(boundedLimit) as AttemptRow[];
    return rows.map(attempt);
  }

  private complete(
    claim: ClaimedMaintenanceJob,
    outcome: MaintenanceJobOutcome,
    errorCode: GielinorErrorCode | undefined,
    now: number,
    nextRunAt: number,
    permanent = false,
  ): boolean {
    return this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE maintenance_jobs
           SET last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END,
               next_run_at = ?,
               failure_count = CASE WHEN ? = 'success' THEN 0 ELSE failure_count + 1 END,
               last_error_code = ?,
               state = CASE
                 WHEN enabled = 0 THEN 'disabled'
                 WHEN ? = 'success' THEN 'idle'
                 WHEN ? = 1 THEN 'failed'
                 ELSE 'backoff'
               END,
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = ?
           WHERE job_name = ?
             AND state = 'running'
             AND lease_owner = ?`,
        )
        .run(
          outcome,
          now,
          nextRunAt,
          outcome,
          permanent ? "GC-SCHED-004" : (errorCode ?? null),
          outcome,
          permanent ? 1 : 0,
          now,
          claim.jobName,
          claim.ownerId,
        );
      if (result.changes !== 1) {
        return false;
      }
      this.database
        .prepare(
          `UPDATE maintenance_job_attempts
           SET completed_at = ?,
               outcome = ?,
               error_code = ?,
               duration_ms = MAX(0, ? - started_at)
           WHERE attempt_id = ? AND completed_at IS NULL`,
        )
        .run(now, outcome, errorCode ?? null, now, claim.attemptId);
      this.trimAttempts(claim.jobName);
      return true;
    })();
  }

  private trimAttempts(jobName: MaintenanceJobName): void {
    this.database
      .prepare(
        `DELETE FROM maintenance_job_attempts
         WHERE attempt_id IN (
           SELECT attempt_id
           FROM maintenance_job_attempts
           WHERE job_name = ?
           ORDER BY started_at DESC, attempt_id
           LIMIT -1 OFFSET 100
         )`,
      )
      .run(jobName);
  }

  private ensureSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_jobs (
        job_name TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        interval_ms INTEGER NOT NULL CHECK (interval_ms >= 60000),
        last_attempt_at INTEGER,
        last_success_at INTEGER,
        next_run_at INTEGER NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
        last_error_code TEXT,
        state TEXT NOT NULL DEFAULT 'idle' CHECK (
          state IN ('idle', 'running', 'backoff', 'failed', 'disabled')
        ),
        lease_owner TEXT,
        lease_expires_at INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_maintenance_jobs_due
        ON maintenance_jobs(enabled, next_run_at, lease_expires_at);
      CREATE TABLE IF NOT EXISTS maintenance_job_attempts (
        attempt_id TEXT PRIMARY KEY,
        job_name TEXT NOT NULL REFERENCES maintenance_jobs(job_name) ON DELETE CASCADE,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        outcome TEXT CHECK (
          outcome IS NULL OR outcome IN ('success', 'failure', 'cancelled', 'interrupted')
        ),
        error_code TEXT,
        duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0)
      );
      CREATE INDEX IF NOT EXISTS idx_maintenance_job_attempts_time
        ON maintenance_job_attempts(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_maintenance_job_attempts_job_time
        ON maintenance_job_attempts(job_name, started_at DESC);
    `);
  }
}

function zSafeEpoch(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Maintenance timestamp must be a non-negative safe integer");
  }
  return value;
}

export type MaintenanceJobHandler = (signal: AbortSignal) => Promise<void>;

export type PersistentSchedulerOptions = {
  now?: (() => number) | undefined;
  ownerId?: string | undefined;
  leaseDurationMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  backoffBaseMs?: number | undefined;
  backoffMaximumMs?: number | undefined;
  maximumRecoveryAttempts?: number | undefined;
  concurrency?: number | undefined;
  networkAllowed?: (() => boolean) | undefined;
  onError?:
    ((error: GielinorError, jobName: MaintenanceJobName) => void | Promise<void>) | undefined;
  onRecovery?:
    | ((jobName: MaintenanceJobName, previousFailureCount: number) => void | Promise<void>)
    | undefined;
};

export type MaintenanceRunResult =
  | { status: "success"; jobName: MaintenanceJobName }
  | { status: "failed"; jobName: MaintenanceJobName; errorCode: GielinorErrorCode }
  | { status: "skipped"; jobName: MaintenanceJobName; reason: "disabled-or-not-due" | "running" };

export class PersistentScheduler {
  private readonly now: () => number;
  private readonly ownerId: string;
  private readonly leaseDurationMs: number;
  private readonly pollIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaximumMs: number;
  private readonly maximumRecoveryAttempts: number;
  private readonly concurrency: number;
  private readonly networkAllowed: () => boolean;
  private readonly onError:
    ((error: GielinorError, jobName: MaintenanceJobName) => void | Promise<void>) | undefined;
  private readonly onRecovery:
    | ((jobName: MaintenanceJobName, previousFailureCount: number) => void | Promise<void>)
    | undefined;
  private readonly active = new Map<MaintenanceJobName, Promise<MaintenanceRunResult>>();
  private readonly abortControllers = new Map<MaintenanceJobName, AbortController>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollPromise: Promise<MaintenanceRunResult[]> | undefined;
  private started = false;

  public constructor(
    private readonly repository: SqliteMaintenanceJobRepository,
    private readonly handlers: Partial<Record<MaintenanceJobName, MaintenanceJobHandler>>,
    options: PersistentSchedulerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.ownerId = options.ownerId ?? randomUUID();
    this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.backoffBaseMs = options.backoffBaseMs ?? 60_000;
    this.backoffMaximumMs = options.backoffMaximumMs ?? 6 * 60 * 60_000;
    this.maximumRecoveryAttempts = Math.max(
      1,
      Math.min(20, Math.trunc(options.maximumRecoveryAttempts ?? 5)),
    );
    this.concurrency = Math.max(1, Math.min(10, Math.trunc(options.concurrency ?? 3)));
    this.networkAllowed = options.networkAllowed ?? (() => true);
    this.onError = options.onError;
    this.onRecovery = options.onRecovery;
  }

  public initialize(definitions: readonly MaintenanceJobDefinition[]): number {
    const now = this.now();
    this.repository.initialize(definitions, now);
    return this.repository.recoverExpiredLeases(now, now + this.backoffBaseMs);
  }

  public start(options: { runImmediately?: boolean; background?: boolean } = {}): void {
    if (this.started) {
      return;
    }
    this.started = true;
    if (options.runImmediately ?? true) {
      void this.runDue();
    }
    if (!(options.background ?? true)) {
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.runDue();
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  public async stop(): Promise<void> {
    this.started = false;
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    for (const controller of this.abortControllers.values()) {
      controller.abort(new Error("Scheduler stopped"));
    }
    await Promise.allSettled([...this.active.values()]);
  }

  public runDue(): Promise<MaintenanceRunResult[]> {
    if (this.pollPromise !== undefined) {
      return this.pollPromise;
    }
    this.pollPromise = this.runDueJobs().finally(() => {
      this.pollPromise = undefined;
    });
    return this.pollPromise;
  }

  public runNow(jobName: MaintenanceJobName): Promise<MaintenanceRunResult> {
    return this.runJob(MaintenanceJobNameSchema.parse(jobName), true);
  }

  private async runDueJobs(): Promise<MaintenanceRunResult[]> {
    if (!this.networkAllowed()) {
      return [];
    }
    const now = this.now();
    this.repository.recoverExpiredLeases(now, now + this.backoffBaseMs);
    const due = this.repository.due(now);
    const results: MaintenanceRunResult[] = [];
    for (let offset = 0; offset < due.length; offset += this.concurrency) {
      const batch = due.slice(offset, offset + this.concurrency);
      results.push(...(await Promise.all(batch.map((name) => this.runJob(name, false)))));
    }
    return results;
  }

  private runJob(jobName: MaintenanceJobName, force: boolean): Promise<MaintenanceRunResult> {
    const current = this.active.get(jobName);
    if (current !== undefined) {
      return Promise.resolve({ status: "skipped", jobName, reason: "running" });
    }
    if (!this.networkAllowed()) {
      return Promise.resolve({ status: "skipped", jobName, reason: "disabled-or-not-due" });
    }
    const handler = this.handlers[jobName];
    if (handler === undefined) {
      return Promise.resolve({ status: "skipped", jobName, reason: "disabled-or-not-due" });
    }
    const claim = this.repository.claim(
      jobName,
      this.ownerId,
      this.now(),
      this.leaseDurationMs,
      force,
    );
    if (claim === undefined) {
      return Promise.resolve({ status: "skipped", jobName, reason: "disabled-or-not-due" });
    }
    const controller = new AbortController();
    this.abortControllers.set(jobName, controller);
    const heartbeat = setInterval(
      () => {
        this.repository.renewLease(claim, this.now(), this.leaseDurationMs);
      },
      Math.max(1_000, Math.trunc(this.leaseDurationMs / 3)),
    );
    heartbeat.unref?.();
    const running = (async (): Promise<MaintenanceRunResult> => {
      try {
        await handler(controller.signal);
        this.repository.completeSuccess(claim, this.now());
        if (claim.failureCount > 0 && this.onRecovery !== undefined) {
          await this.notify(() => this.onRecovery?.(jobName, claim.failureCount));
        }
        return { status: "success", jobName };
      } catch (error) {
        const structured = toGielinorError(error, {
          fallbackCode: controller.signal.aborted ? "GC-SYNC-004" : "GC-SCHED-001",
          source: "maintenance-scheduler",
          operation: jobName,
        });
        if (this.onError !== undefined) {
          await this.notify(() => this.onError?.(structured, jobName));
        }
        const failureNumber = claim.failureCount + 1;
        const permanent =
          !controller.signal.aborted && failureNumber >= this.maximumRecoveryAttempts;
        const backoff = Math.min(
          this.backoffMaximumMs,
          this.backoffBaseMs * 2 ** Math.min(20, failureNumber - 1),
        );
        this.repository.completeFailure(
          claim,
          structured.code,
          this.now() + backoff,
          this.now(),
          controller.signal.aborted ? "cancelled" : "failure",
          permanent,
        );
        return { status: "failed", jobName, errorCode: structured.code };
      } finally {
        clearInterval(heartbeat);
        this.abortControllers.delete(jobName);
        this.active.delete(jobName);
      }
    })();
    this.active.set(jobName, running);
    return running;
  }

  private async notify(callback: () => void | Promise<void> | undefined): Promise<void> {
    try {
      await callback();
    } catch {
      // Diagnostics callbacks cannot change the outcome of maintenance work.
    }
  }
}
