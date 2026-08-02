import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  applyDatabaseMigrations,
  DATABASE_MIGRATIONS,
  DATABASE_SCHEMA_VERSION,
  getDatabaseSchemaVersion,
  openDatabase,
} from "../src/connection.js";

describe("Version 1 stable database upgrade path", () => {
  it("upgrades a Version 1 profile through every documented schema without data loss", () => {
    const database = openDatabase(":memory:", { targetVersion: 1 });
    const id = randomUUID();
    const profile = {
      id,
      displayName: "Upgrade Hero",
      gameMode: "normal",
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    };
    database
      .prepare(
        `INSERT INTO player_profiles
          (id, display_name, profile_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, profile.displayName, JSON.stringify(profile), "2026-07-24", "2026-07-24");

    for (let target = 2; target <= DATABASE_SCHEMA_VERSION; target += 1) {
      expect(applyDatabaseMigrations(database, DATABASE_MIGRATIONS, target)).toEqual([target]);
      expect(getDatabaseSchemaVersion(database)).toBe(target);
      expect(
        database.prepare("SELECT profile_json FROM player_profiles WHERE id = ?").get(id),
      ).toEqual({ profile_json: JSON.stringify(profile) });
    }

    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_player_profiles_updated_at'",
        )
        .get(),
    ).toBeTruthy();
    database.close();
  });

  it("creates a fresh database at the stable schema target", () => {
    const database = openDatabase(":memory:");
    expect(getDatabaseSchemaVersion(database)).toBe(DATABASE_SCHEMA_VERSION);
    expect(DATABASE_MIGRATIONS.map((migration) => migration.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    database.close();
  });
});
