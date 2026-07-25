import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { createGielinorError, createTraceId, type GielinorError } from "@gielinor/shared-types";
import Database from "better-sqlite3";

import {
  applyDatabaseMigrations,
  DATABASE_MIGRATIONS,
  DATABASE_SCHEMA_VERSION,
  getDatabaseSchemaVersion,
  openDatabase,
  type DatabaseConnection,
  type DatabaseMigration,
} from "./connection.js";

export type DatabaseRecoveryStatus = "ready" | "recovered" | "safe-mode";

export type DatabaseRecoveryState = {
  status: DatabaseRecoveryStatus;
  mode: "read-write" | "read-only";
  checkedAt: string;
  schemaVersion: number;
  action: string;
  originalPreserved: boolean;
  backupId?: string;
  error?: GielinorError;
  suggestedActions: string[];
};

export type ResilientDatabase = {
  database: DatabaseConnection;
  state: DatabaseRecoveryState;
  close(): void;
};

export type DatabaseFaultInjection = "after-backup-marker" | "after-migrations-before-verification";

export type OpenResilientDatabaseOptions = {
  busyTimeoutMs?: number;
  targetVersion?: number;
  migrations?: readonly DatabaseMigration[];
  backupDirectory?: string;
  faultInjection?: DatabaseFaultInjection;
};

type MigrationMarker = {
  markerVersion: 1;
  databaseFilename: string;
  backupFilename: string;
  backupId: string;
  sourceVersion: number;
  targetVersion: number;
  startedAt: string;
};

type BackupManifest = {
  manifestVersion: 1;
  databaseFilename: string;
  backupFilename: string;
  backupId: string;
  schemaVersion: number;
  verifiedAt: string;
  sizeBytes: number;
};

const MARKER_SUFFIX = ".migration-state.json";
const RECOVERY_SUFFIX = ".recovery-state.json";
const BACKUP_MANIFEST_SUFFIX = ".manifest.json";

function assertFileDatabase(filename: string): string {
  if (filename === ":memory:") {
    throw new TypeError("Recovery operations require a file database");
  }
  return resolve(filename);
}

function assertWithinDirectory(candidate: string, directory: string): string {
  const resolvedCandidate = resolve(candidate);
  const resolvedDirectory = resolve(directory);
  const prefix = `${resolvedDirectory}${process.platform === "win32" ? "\\" : "/"}`;
  if (resolvedCandidate !== resolvedDirectory && !resolvedCandidate.startsWith(prefix)) {
    throw new Error("Recovery path is outside the database directory");
  }
  return resolvedCandidate;
}

function markerFilename(databaseFilename: string): string {
  return `${databaseFilename}${MARKER_SUFFIX}`;
}

function recoveryStateFilename(databaseFilename: string): string {
  return `${databaseFilename}${RECOVERY_SUFFIX}`;
}

function writePrivateJson(filename: string, value: unknown): void {
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readJson(filename: string): unknown {
  return JSON.parse(readFileSync(filename, "utf8")) as unknown;
}

function isMigrationMarker(value: unknown): value is MigrationMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<MigrationMarker>;
  return (
    candidate.markerVersion === 1 &&
    typeof candidate.databaseFilename === "string" &&
    typeof candidate.backupFilename === "string" &&
    typeof candidate.backupId === "string" &&
    typeof candidate.sourceVersion === "number" &&
    typeof candidate.targetVersion === "number" &&
    typeof candidate.startedAt === "string"
  );
}

function configureDatabase(
  database: DatabaseConnection,
  filename: string,
  busyTimeoutMs: number,
): void {
  database.pragma("foreign_keys = ON");
  database.pragma(`busy_timeout = ${busyTimeoutMs}`);
  if (filename !== ":memory:") {
    database.pragma("journal_mode = WAL");
  }
}

function validateBusyTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000) {
    throw new RangeError("SQLite busy timeout must be between 0 and 60000 milliseconds");
  }
}

export function checkDatabaseIntegrity(database: DatabaseConnection): {
  ok: boolean;
  messages: string[];
} {
  try {
    const rows = database.pragma("integrity_check") as Array<Record<string, unknown>>;
    const messages = rows
      .flatMap((row) => Object.values(row))
      .filter((value): value is string => typeof value === "string");
    return {
      ok: messages.length === 1 && messages[0]?.toLocaleLowerCase("en-GB") === "ok",
      messages: messages.slice(0, 20),
    };
  } catch {
    return { ok: false, messages: ["integrity-check-unavailable"] };
  }
}

function verifyDatabaseFile(
  filename: string,
  expectedVersion?: number,
): { ok: boolean; schemaVersion: number } {
  let database: DatabaseConnection | undefined;
  try {
    database = new Database(filename, { readonly: true, fileMustExist: true });
    const integrity = checkDatabaseIntegrity(database);
    const schemaVersion = getDatabaseSchemaVersion(database);
    return {
      ok: integrity.ok && (expectedVersion === undefined || schemaVersion === expectedVersion),
      schemaVersion,
    };
  } catch {
    return { ok: false, schemaVersion: -1 };
  } finally {
    database?.close();
  }
}

function createVerifiedBackup(
  database: DatabaseConnection,
  databaseFilename: string,
  sourceVersion: number,
  targetVersion: number,
  backupDirectory: string,
): BackupManifest {
  mkdirSync(backupDirectory, { recursive: true });
  const backupId = createTraceId();
  const safeBase = basename(databaseFilename).replaceAll(/[^A-Za-z0-9._-]/g, "_");
  const backupFilename = assertWithinDirectory(
    join(backupDirectory, `${safeBase}.pre-v${sourceVersion}-to-v${targetVersion}.${backupId}.db`),
    backupDirectory,
  );
  database.pragma("wal_checkpoint(FULL)");
  database.prepare("VACUUM INTO ?").run(backupFilename);
  const verified = verifyDatabaseFile(backupFilename, sourceVersion);
  if (!verified.ok) {
    throw new Error("Pre-migration backup failed verification");
  }
  const manifest: BackupManifest = {
    manifestVersion: 1,
    databaseFilename,
    backupFilename,
    backupId,
    schemaVersion: sourceVersion,
    verifiedAt: new Date().toISOString(),
    sizeBytes: statSync(backupFilename).size,
  };
  writePrivateJson(`${backupFilename}${BACKUP_MANIFEST_SUFFIX}`, manifest);
  return manifest;
}

function preserveSidecar(filename: string, preservedFilename: string, suffix: string): void {
  const sidecar = `${filename}${suffix}`;
  if (existsSync(sidecar)) {
    renameSync(sidecar, `${preservedFilename}${suffix}`);
  }
}

export function restoreVerifiedDatabaseBackup(
  databaseFilenameInput: string,
  backupFilenameInput: string,
  expectedVersion?: number,
): { preservedFilename?: string; schemaVersion: number } {
  const databaseFilename = assertFileDatabase(databaseFilenameInput);
  const directory = dirname(databaseFilename);
  const backupFilename = assertWithinDirectory(backupFilenameInput, directory);
  const verifiedBackup = verifyDatabaseFile(backupFilename, expectedVersion);
  if (!verifiedBackup.ok) {
    throw new Error("Database backup is not valid and cannot be restored");
  }
  const temporaryFilename = assertWithinDirectory(
    join(directory, `.${basename(databaseFilename)}.restore-${createTraceId()}.tmp`),
    directory,
  );
  copyFileSync(backupFilename, temporaryFilename);
  if (!verifyDatabaseFile(temporaryFilename, expectedVersion).ok) {
    unlinkSync(temporaryFilename);
    throw new Error("Copied database backup failed verification");
  }

  let preservedFilename: string | undefined;
  if (existsSync(databaseFilename)) {
    preservedFilename = assertWithinDirectory(
      join(directory, `${basename(databaseFilename)}.preserved-${createTraceId()}.db`),
      directory,
    );
    renameSync(databaseFilename, preservedFilename);
    preserveSidecar(databaseFilename, preservedFilename, "-wal");
    preserveSidecar(databaseFilename, preservedFilename, "-shm");
  }
  try {
    renameSync(temporaryFilename, databaseFilename);
  } catch (error) {
    if (preservedFilename !== undefined && !existsSync(databaseFilename)) {
      renameSync(preservedFilename, databaseFilename);
    }
    throw error;
  }
  return {
    ...(preservedFilename === undefined ? {} : { preservedFilename }),
    schemaVersion: verifiedBackup.schemaVersion,
  };
}

function safeMode(
  state: Omit<DatabaseRecoveryState, "status" | "mode" | "schemaVersion">,
  targetVersion: number,
  migrations: readonly DatabaseMigration[],
): ResilientDatabase {
  const database = openDatabase(":memory:", { targetVersion, migrations });
  database.pragma("query_only = ON");
  const completeState: DatabaseRecoveryState = {
    ...state,
    status: "safe-mode",
    mode: "read-only",
    schemaVersion: targetVersion,
  };
  return {
    database,
    state: completeState,
    close: () => database.close(),
  };
}

function recordRecoveryEvent(database: DatabaseConnection, state: DatabaseRecoveryState): void {
  try {
    database
      .prepare(
        `INSERT INTO database_recovery_events
           (event_id, event_at, status, error_code, action, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        createTraceId(),
        state.checkedAt,
        state.status,
        state.error?.code ?? null,
        state.action,
        JSON.stringify({
          mode: state.mode,
          schemaVersion: state.schemaVersion,
          originalPreserved: state.originalPreserved,
          ...(state.backupId === undefined ? {} : { backupId: state.backupId }),
        }),
      );
  } catch {
    // Recovery reporting must not turn a usable database into a startup failure.
  }
}

function databaseError(
  code: "GC-DB-003" | "GC-DB-004" | "GC-DB-006" | "GC-DB-007",
  message: string,
  operation: string,
): GielinorError {
  return createGielinorError(code, {
    message,
    userMessage: message,
    source: "database-recovery",
    operation,
  });
}

function writeRecoveryState(databaseFilename: string, state: DatabaseRecoveryState): void {
  writePrivateJson(recoveryStateFilename(databaseFilename), state);
}

export function openResilientDatabase(
  filenameInput: string,
  options: OpenResilientDatabaseOptions = {},
): ResilientDatabase {
  if (filenameInput === ":memory:") {
    const database = openDatabase(filenameInput, options);
    const state: DatabaseRecoveryState = {
      status: "ready",
      mode: "read-write",
      checkedAt: new Date().toISOString(),
      schemaVersion: getDatabaseSchemaVersion(database),
      action: "fresh-memory-database",
      originalPreserved: true,
      suggestedActions: [],
    };
    return { database, state, close: () => database.close() };
  }

  const databaseFilename = assertFileDatabase(filenameInput);
  const directory = dirname(databaseFilename);
  mkdirSync(directory, { recursive: true });
  const backupDirectory = assertWithinDirectory(
    options.backupDirectory ?? join(directory, "backups"),
    directory,
  );
  const migrations = options.migrations ?? DATABASE_MIGRATIONS;
  const targetVersion =
    options.targetVersion ?? migrations.at(-1)?.version ?? DATABASE_SCHEMA_VERSION;
  const busyTimeoutMs = options.busyTimeoutMs ?? 5_000;
  validateBusyTimeout(busyTimeoutMs);
  const checkedAt = new Date().toISOString();
  const markerPath = markerFilename(databaseFilename);
  let recoveredFromInterruption = false;
  let recoveredBackupId: string | undefined;

  if (existsSync(markerPath)) {
    try {
      const markerValue = readJson(markerPath);
      if (!isMigrationMarker(markerValue)) {
        throw new Error("Migration recovery marker is invalid");
      }
      if (resolve(markerValue.databaseFilename) !== databaseFilename) {
        throw new Error("Migration recovery marker targets a different database");
      }
      const backupFilename = assertWithinDirectory(markerValue.backupFilename, directory);
      const current = verifyDatabaseFile(databaseFilename);
      if (current.ok && current.schemaVersion === markerValue.targetVersion) {
        unlinkSync(markerPath);
        recoveredFromInterruption = true;
        recoveredBackupId = markerValue.backupId;
      } else {
        restoreVerifiedDatabaseBackup(databaseFilename, backupFilename, markerValue.sourceVersion);
        unlinkSync(markerPath);
        recoveredFromInterruption = true;
        recoveredBackupId = markerValue.backupId;
      }
    } catch {
      const error = databaseError(
        "GC-DB-007",
        "An interrupted database upgrade could not be restored automatically",
        "recover-interrupted-migration",
      );
      const stateBase = {
        checkedAt,
        action: "preserve-and-enter-safe-mode",
        originalPreserved: true,
        error,
        suggestedActions: [
          "Open Diagnostics and review database recovery",
          "Restore a verified backup explicitly",
        ],
      };
      const safeTargetVersion = Math.min(targetVersion, DATABASE_SCHEMA_VERSION);
      const runtime = safeMode(stateBase, safeTargetVersion, DATABASE_MIGRATIONS);
      writeRecoveryState(databaseFilename, runtime.state);
      return runtime;
    }
  }

  const existed = existsSync(databaseFilename);
  let database: DatabaseConnection | undefined;
  let migrationBackup: BackupManifest | undefined;
  try {
    database = new Database(databaseFilename);
    configureDatabase(database, databaseFilename, busyTimeoutMs);
    const integrity = checkDatabaseIntegrity(database);
    if (!integrity.ok) {
      throw Object.assign(new Error("Database integrity check failed"), {
        gielinorCode: "GC-DB-004",
      });
    }
    const sourceVersion = getDatabaseSchemaVersion(database);
    if (sourceVersion > targetVersion) {
      throw new Error("Database schema is newer than this application supports");
    }
    if (existed && sourceVersion > 0 && sourceVersion < targetVersion) {
      migrationBackup = createVerifiedBackup(
        database,
        databaseFilename,
        sourceVersion,
        targetVersion,
        backupDirectory,
      );
      const marker: MigrationMarker = {
        markerVersion: 1,
        databaseFilename,
        backupFilename: migrationBackup.backupFilename,
        backupId: migrationBackup.backupId,
        sourceVersion,
        targetVersion,
        startedAt: new Date().toISOString(),
      };
      writePrivateJson(markerPath, marker);
      if (options.faultInjection === "after-backup-marker") {
        database.close();
        throw Object.assign(new Error("Injected migration interruption"), {
          preserveMarker: true,
        });
      }
    }

    applyDatabaseMigrations(database, migrations, targetVersion);
    if (options.faultInjection === "after-migrations-before-verification") {
      database.close();
      throw Object.assign(new Error("Injected post-migration interruption"), {
        preserveMarker: true,
      });
    }
    const after = checkDatabaseIntegrity(database);
    if (!after.ok || getDatabaseSchemaVersion(database) !== targetVersion) {
      throw new Error("Migrated database failed verification");
    }
    if (existsSync(markerPath)) {
      unlinkSync(markerPath);
    }
    const backupId = migrationBackup?.backupId ?? recoveredBackupId;
    const state: DatabaseRecoveryState = {
      status: recoveredFromInterruption ? "recovered" : "ready",
      mode: "read-write",
      checkedAt,
      schemaVersion: targetVersion,
      action: recoveredFromInterruption
        ? "recovered-interrupted-migration"
        : !existed
          ? "fresh-install"
          : sourceVersion < targetVersion
            ? "verified-migration"
            : "verified-startup",
      originalPreserved: true,
      ...(backupId === undefined ? {} : { backupId }),
      suggestedActions: [],
    };
    recordRecoveryEvent(database, state);
    writeRecoveryState(databaseFilename, state);
    const readyDatabase = database;
    return { database: readyDatabase, state, close: () => readyDatabase.close() };
  } catch (caught) {
    if (
      typeof caught === "object" &&
      caught !== null &&
      Reflect.get(caught, "preserveMarker") === true
    ) {
      throw caught;
    }
    database?.close();
    let action = "preserve-and-enter-safe-mode";
    let error = databaseError(
      "GC-DB-004",
      "The database could not be verified and was preserved",
      "startup-integrity",
    );
    if (migrationBackup !== undefined) {
      try {
        restoreVerifiedDatabaseBackup(
          databaseFilename,
          migrationBackup.backupFilename,
          migrationBackup.schemaVersion,
        );
        if (existsSync(markerPath)) {
          unlinkSync(markerPath);
        }
        action = "rolled-back-failed-migration";
        error = databaseError(
          "GC-DB-003",
          "The database upgrade failed and the verified backup was restored",
          "migration-rollback",
        );
      } catch {
        error = databaseError(
          "GC-DB-007",
          "Database migration and automatic restore both failed",
          "migration-restore",
        );
      }
    }
    const safeTargetVersion = Math.min(targetVersion, DATABASE_SCHEMA_VERSION);
    const runtime = safeMode(
      {
        checkedAt,
        action,
        originalPreserved: true,
        ...(migrationBackup === undefined ? {} : { backupId: migrationBackup.backupId }),
        error,
        suggestedActions: [
          "Open Diagnostics and review database recovery",
          "Keep the preserved database and backup files",
          "Restore a verified backup explicitly after closing other instances",
        ],
      },
      safeTargetVersion,
      DATABASE_MIGRATIONS,
    );
    writeRecoveryState(databaseFilename, runtime.state);
    return runtime;
  }
}
