import {
  GielinorErrorSchema,
  RecoveryEventSchema,
  sanitisePublicDetails,
  type GielinorError,
  type RecoveryEvent,
} from "@gielinor/shared-types";

import type { DatabaseConnection } from "./connection.js";

type ErrorRow = {
  error_json: string;
};

type RecoveryRow = {
  event_id: string;
  component: string;
  action: string;
  outcome: string;
  automatic: number;
  occurred_at: number;
  error_code: string | null;
  trace_id: string | null;
  details_json: string;
};

type DatabaseRecoveryRow = {
  event_id: string;
  event_at: string;
  status: string;
  error_code: string | null;
  action: string;
  details_json: string;
};

export class SqliteDiagnosticsRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public recordError(errorInput: GielinorError, active = true): void {
    this.ensureSchema();
    const error = GielinorErrorSchema.parse(errorInput);
    const occurredAt = Date.parse(error.timestamp);
    this.database
      .prepare(
        `INSERT INTO diagnostic_errors
           (trace_id, occurred_at, error_json, active, resolved_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(trace_id) DO UPDATE SET
           occurred_at = excluded.occurred_at,
           error_json = excluded.error_json,
           active = excluded.active,
           resolved_at = CASE WHEN excluded.active = 1 THEN NULL ELSE resolved_at END`,
      )
      .run(error.traceId, occurredAt, JSON.stringify(error), active ? 1 : 0);
    this.trim("diagnostic_errors", "occurred_at", 500);
  }

  public resolveError(traceId: string, now = Date.now()): boolean {
    this.ensureSchema();
    const result = this.database
      .prepare(
        `UPDATE diagnostic_errors
         SET active = 0, resolved_at = ?
         WHERE trace_id = ? AND active = 1`,
      )
      .run(now, traceId);
    return result.changes === 1;
  }

  public listErrors(options: { limit?: number; activeOnly?: boolean } = {}): GielinorError[] {
    this.ensureSchema();
    const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 50)));
    const rows = this.database
      .prepare(
        `SELECT error_json
         FROM diagnostic_errors
         ${options.activeOnly === true ? "WHERE active = 1" : ""}
         ORDER BY occurred_at DESC, trace_id
         LIMIT ?`,
      )
      .all(limit) as ErrorRow[];
    const errors: GielinorError[] = [];
    for (const row of rows) {
      try {
        errors.push(GielinorErrorSchema.parse(JSON.parse(row.error_json)));
      } catch {
        // A malformed diagnostics row is ignored rather than exposed or activated.
      }
    }
    return errors;
  }

  public recordRecovery(eventInput: RecoveryEvent): void {
    this.ensureSchema();
    const event = RecoveryEventSchema.parse({
      ...eventInput,
      ...(eventInput.details === undefined
        ? {}
        : { details: sanitisePublicDetails(eventInput.details) }),
    });
    this.database
      .prepare(
        `INSERT INTO recovery_events
           (event_id, component, action, outcome, automatic, occurred_at,
            error_code, trace_id, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET
           outcome = excluded.outcome,
           error_code = excluded.error_code,
           trace_id = excluded.trace_id,
           details_json = excluded.details_json`,
      )
      .run(
        event.eventId,
        event.component,
        event.action,
        event.outcome,
        event.automatic ? 1 : 0,
        Date.parse(event.occurredAt),
        event.errorCode ?? null,
        event.traceId ?? null,
        JSON.stringify(event.details ?? {}),
      );
    this.trim("recovery_events", "occurred_at", 500);
  }

  public listRecoveries(limit = 50): RecoveryEvent[] {
    this.ensureSchema();
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT *
         FROM recovery_events
         ORDER BY occurred_at DESC, event_id
         LIMIT ?`,
      )
      .all(boundedLimit) as RecoveryRow[];
    const events: RecoveryEvent[] = [];
    for (const row of rows) {
      try {
        const details = JSON.parse(row.details_json) as unknown;
        events.push(
          RecoveryEventSchema.parse({
            eventId: row.event_id,
            component: row.component,
            action: row.action,
            outcome: row.outcome,
            automatic: row.automatic === 1,
            occurredAt: new Date(row.occurred_at).toISOString(),
            ...(row.error_code === null ? {} : { errorCode: row.error_code }),
            ...(row.trace_id === null ? {} : { traceId: row.trace_id }),
            ...(typeof details === "object" && details !== null
              ? { details: sanitisePublicDetails(details as Record<string, unknown>) }
              : {}),
          }),
        );
      } catch {
        // Invalid diagnostics metadata is not a reason to expose its raw contents.
      }
    }
    return events;
  }

  public listDatabaseRecoveries(limit = 50): RecoveryEvent[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT *
         FROM database_recovery_events
         ORDER BY event_at DESC, event_id
         LIMIT ?`,
      )
      .all(boundedLimit) as DatabaseRecoveryRow[];
    const events: RecoveryEvent[] = [];
    for (const row of rows) {
      try {
        const details = JSON.parse(row.details_json) as unknown;
        const errorCode = row.error_code === null ? undefined : row.error_code;
        events.push(
          RecoveryEventSchema.parse({
            eventId: row.event_id,
            component: "database",
            action: row.action,
            outcome: row.status === "safe-mode" ? "failed" : "succeeded",
            automatic: true,
            occurredAt: row.event_at,
            ...(errorCode === undefined ? {} : { errorCode }),
            ...(typeof details === "object" && details !== null
              ? { details: sanitisePublicDetails(details as Record<string, unknown>) }
              : {}),
          }),
        );
      } catch {
        // Recovery diagnostics remain available even if one historic row is invalid.
      }
    }
    return events;
  }

  private ensureSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS diagnostic_errors (
        trace_id TEXT PRIMARY KEY,
        occurred_at INTEGER NOT NULL,
        error_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_diagnostic_errors_time
        ON diagnostic_errors(occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_diagnostic_errors_active
        ON diagnostic_errors(active, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS recovery_events (
        event_id TEXT PRIMARY KEY,
        component TEXT NOT NULL,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'in-progress')),
        automatic INTEGER NOT NULL CHECK (automatic IN (0, 1)),
        occurred_at INTEGER NOT NULL,
        error_code TEXT,
        trace_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_events_time
        ON recovery_events(occurred_at DESC);
    `);
  }

  private trim(
    table: "diagnostic_errors" | "recovery_events",
    column: string,
    retain: number,
  ): void {
    const id = table === "diagnostic_errors" ? "trace_id" : "event_id";
    this.database
      .prepare(
        `DELETE FROM ${table}
         WHERE ${id} IN (
           SELECT ${id}
           FROM ${table}
           ORDER BY ${column} DESC, ${id}
           LIMIT -1 OFFSET ?
         )`,
      )
      .run(retain);
  }
}
