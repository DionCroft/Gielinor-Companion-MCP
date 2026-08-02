import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  DATABASE_MIGRATIONS,
  getDatabaseSchemaVersion,
  openDatabase,
  openResilientDatabase,
  restoreVerifiedDatabaseBackup,
  type DatabaseMigration,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), "gielinor-recovery-"));
  temporaryDirectories.push(value);
  return value;
}

function createVersionedDatabase(filename: string, version: number): void {
  const database = openDatabase(filename, { targetVersion: version });
  database
    .prepare(
      `INSERT INTO player_profiles
         (id, display_name, profile_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "00000000-0000-4000-8000-000000000001",
      "Recovery Hero",
      JSON.stringify({
        id: "00000000-0000-4000-8000-000000000001",
        displayName: "Recovery Hero",
        gameMode: "normal",
        skills: [],
        completedQuestIds: [],
        inProgressQuestIds: [],
        goals: [],
      }),
      "2026-07-24T00:00:00.000Z",
      "2026-07-24T00:00:00.000Z",
    );
  database.close();
}

afterEach(() => {
  for (const value of temporaryDirectories.splice(0)) {
    rmSync(value, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});

describe("resilient SQLite startup", () => {
  it("creates and verifies a fresh database without a migration backup", () => {
    const root = directory();
    const filename = join(root, "fresh.db");
    const runtime = openResilientDatabase(filename);
    expect(runtime.state).toMatchObject({
      status: "ready",
      mode: "read-write",
      schemaVersion: 7,
      action: "fresh-install",
      originalPreserved: true,
    });
    expect(runtime.state.backupId).toBeUndefined();
    expect(getDatabaseSchemaVersion(runtime.database)).toBe(7);
    expect(
      runtime.database.prepare("SELECT COUNT(*) AS count FROM database_recovery_events").get(),
    ).toEqual({ count: 1 });
    runtime.close();
  });

  it("creates a verified backup before upgrade and preserves existing rows", () => {
    const root = directory();
    const filename = join(root, "upgrade.db");
    createVersionedDatabase(filename, 5);

    const runtime = openResilientDatabase(filename);
    expect(runtime.state).toMatchObject({
      status: "ready",
      mode: "read-write",
      schemaVersion: 7,
      action: "verified-migration",
      backupId: expect.any(String),
    });
    expect(runtime.database.prepare("SELECT display_name FROM player_profiles").get()).toEqual({
      display_name: "Recovery Hero",
    });
    runtime.close();

    const backups = readdirSync(join(root, "backups"));
    expect(backups.filter((name) => name.endsWith(".db"))).toHaveLength(1);
    expect(backups.filter((name) => name.endsWith(".manifest.json"))).toHaveLength(1);
  });

  it("recovers an interruption after the backup marker and completes the upgrade", () => {
    const root = directory();
    const filename = join(root, "interrupted.db");
    createVersionedDatabase(filename, 5);
    expect(() =>
      openResilientDatabase(filename, {
        faultInjection: "after-backup-marker",
      }),
    ).toThrow("Injected migration interruption");
    expect(existsSync(`${filename}.migration-state.json`)).toBe(true);

    const recovered = openResilientDatabase(filename);
    expect(recovered.state).toMatchObject({
      status: "recovered",
      action: "recovered-interrupted-migration",
      schemaVersion: 7,
      backupId: expect.any(String),
    });
    expect(recovered.database.prepare("SELECT display_name FROM player_profiles").get()).toEqual({
      display_name: "Recovery Hero",
    });
    expect(existsSync(`${filename}.migration-state.json`)).toBe(false);
    recovered.close();
  });

  it("recognises an upgrade completed before marker cleanup", () => {
    const root = directory();
    const filename = join(root, "post-migration.db");
    createVersionedDatabase(filename, 5);
    expect(() =>
      openResilientDatabase(filename, {
        faultInjection: "after-migrations-before-verification",
      }),
    ).toThrow("Injected post-migration interruption");
    expect(existsSync(`${filename}.migration-state.json`)).toBe(true);

    const recovered = openResilientDatabase(filename);
    expect(recovered.state).toMatchObject({
      status: "recovered",
      action: "recovered-interrupted-migration",
      schemaVersion: 7,
    });
    expect(existsSync(`${filename}.migration-state.json`)).toBe(false);
    recovered.close();
  });

  it("rolls back a failed migration to the verified backup and enters safe mode", () => {
    const root = directory();
    const filename = join(root, "failed-migration.db");
    createVersionedDatabase(filename, 7);
    const brokenMigration: DatabaseMigration = {
      version: 8,
      name: "injected-broken-migration",
      sql: `
        CREATE TABLE should_not_survive (id INTEGER PRIMARY KEY);
        INSERT INTO missing_table (id) VALUES (1);
      `,
    };
    const runtime = openResilientDatabase(filename, {
      targetVersion: 8,
      migrations: [...DATABASE_MIGRATIONS, brokenMigration],
    });
    expect(runtime.state).toMatchObject({
      status: "safe-mode",
      mode: "read-only",
      action: "rolled-back-failed-migration",
      originalPreserved: true,
      error: { code: "GC-DB-003" },
    });
    expect(() => runtime.database.exec("CREATE TABLE unsafe_write (id INTEGER)")).toThrow();
    runtime.close();

    const restored = new Database(filename, { readonly: true });
    expect(getDatabaseSchemaVersion(restored)).toBe(7);
    expect(restored.prepare("SELECT display_name FROM player_profiles").get()).toEqual({
      display_name: "Recovery Hero",
    });
    expect(
      restored
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_not_survive'",
        )
        .get(),
    ).toBeUndefined();
    restored.close();
  });

  it("preserves a corrupt database unchanged and starts read-only safe mode", () => {
    const root = directory();
    const filename = join(root, "corrupt.db");
    const original = Buffer.from("not-a-sqlite-database");
    writeFileSync(filename, original);

    const runtime = openResilientDatabase(filename);
    expect(runtime.state).toMatchObject({
      status: "safe-mode",
      mode: "read-only",
      action: "preserve-and-enter-safe-mode",
      originalPreserved: true,
      error: { code: "GC-DB-004" },
    });
    expect(readFileSync(filename)).toEqual(original);
    expect(JSON.stringify(runtime.state)).not.toContain(root);
    expect(() => runtime.database.exec("CREATE TABLE unsafe_write (id INTEGER)")).toThrow();
    runtime.close();
  });

  it("enters safe mode when another process prevents a safe upgrade", () => {
    const root = directory();
    const filename = join(root, "locked.db");
    createVersionedDatabase(filename, 5);
    const blocker = new Database(filename);
    blocker.exec("BEGIN EXCLUSIVE");
    try {
      const runtime = openResilientDatabase(filename, { busyTimeoutMs: 1 });
      expect(runtime.state).toMatchObject({
        status: "safe-mode",
        mode: "read-only",
        originalPreserved: true,
      });
      runtime.close();
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }

    const database = openDatabase(filename);
    expect(database.prepare("SELECT display_name FROM player_profiles").get()).toEqual({
      display_name: "Recovery Hero",
    });
    database.close();
  });

  it("restores only a verified backup and preserves the replaced file", () => {
    const root = directory();
    const filename = join(root, "restore.db");
    createVersionedDatabase(filename, 5);
    const upgraded = openResilientDatabase(filename);
    upgraded.close();
    const backup = readdirSync(join(root, "backups"))
      .filter((name) => name.endsWith(".db"))
      .map((name) => join(root, "backups", name))[0]!;
    writeFileSync(filename, "corrupt-current-file");

    const restored = restoreVerifiedDatabaseBackup(filename, backup, 5);
    expect(restored).toMatchObject({
      schemaVersion: 5,
      preservedFilename: expect.any(String),
    });
    expect(existsSync(restored.preservedFilename!)).toBe(true);
    const database = openDatabase(filename);
    expect(getDatabaseSchemaVersion(database)).toBe(7);
    expect(database.prepare("SELECT display_name FROM player_profiles").get()).toEqual({
      display_name: "Recovery Hero",
    });
    database.close();

    writeFileSync(join(root, "invalid-backup.db"), "invalid");
    expect(() => restoreVerifiedDatabaseBackup(filename, join(root, "invalid-backup.db"))).toThrow(
      "not valid",
    );
  });
});
