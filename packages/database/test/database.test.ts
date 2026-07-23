import { randomUUID } from "node:crypto";

import { PlayerProfileSchema } from "@gielinor/shared-types";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseSchemaVersion, openDatabase } from "../src/connection.js";
import { SqliteCacheStore, SqlitePlayerProfileRepository } from "../src/repositories.js";

const databases: ReturnType<typeof openDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("SQLite migrations and repositories", () => {
  it("applies migrations transactionally to a new database", () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    expect(getDatabaseSchemaVersion(database)).toBe(1);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'player_profiles'")
        .get(),
    ).toBeTruthy();
  });

  it("round-trips validated player profiles", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqlitePlayerProfileRepository(database);
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: "Rune Tester",
      gameMode: "normal",
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    });

    await repository.create(profile);
    expect(await repository.getById(profile.id)).toEqual(profile);
    expect(await repository.list()).toEqual([profile]);
  });

  it("persists provider cache metadata", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const cache = new SqliteCacheStore(database);
    const entry = {
      value: { valid: true },
      storedAt: 1,
      freshUntil: 2,
      staleUntil: 3,
    };
    await cache.set("test", entry);
    expect(await cache.get("test")).toEqual(entry);
  });
});
