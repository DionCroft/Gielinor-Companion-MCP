import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PlayerProfileSchema,
  PriceCatalogueItemSchema,
  PriceDataSnapshotSchema,
  QuestDataSnapshotSchema,
  QuestSchema,
  TrainingDataSnapshotSchema,
  TrainingMethodSchema,
  type Quest,
  type QuestDataSnapshot,
  type TrainingMethod,
  type PriceCatalogueItem,
} from "@gielinor/shared-types";
import { afterEach, describe, expect, it } from "vitest";

import { backupDatabase, getDatabaseSchemaVersion, openDatabase } from "../src/connection.js";
import {
  SqliteCacheStore,
  SqlitePlayerProfileRepository,
  SqlitePriceRepository,
  SqliteQuestRepository,
  SqliteTrainingMethodRepository,
} from "../src/repositories.js";

const databases: ReturnType<typeof openDatabase>[] = [];
const temporaryFiles: string[] = [];
const CHECKED_AT = "2026-07-23T12:00:00.000Z";

function quest(
  id: string,
  options: { name?: string; aliases?: string[]; hash?: string; revision?: string } = {},
): Quest {
  return QuestSchema.parse({
    id,
    name: options.name ?? id,
    aliases: options.aliases ?? [],
    members: true,
    prerequisiteQuestIds: [],
    prerequisiteGroups: [],
    skillRequirements: [],
    otherRequirements: [],
    itemRequirements: [],
    recommendedItems: [],
    rewards: [],
    sourceName: "fixture",
    sourceRevision: options.revision ?? "1",
    sourceUpdatedAt: CHECKED_AT,
    contentHash: options.hash ?? "a".repeat(64),
    lastCheckedAt: CHECKED_AT,
  });
}

function snapshot(quests: Quest[], revision = "snapshot-1"): QuestDataSnapshot {
  return QuestDataSnapshotSchema.parse({
    provider: "fixture",
    sourceUrl: "https://example.test/quests",
    sourceRevision: revision,
    retrievedAt: CHECKED_AT,
    quests,
  });
}

function trainingMethod(id: string, hash = "c".repeat(64)): TrainingMethod {
  return TrainingMethodSchema.parse({
    id,
    name: id,
    skillId: "mining",
    minimumLevel: 1,
    xpPerHour: 1_000,
    xpPerHourRange: { minimum: 900, maximum: 1_000 },
    intensity: "medium",
    afkRating: "low",
    members: true,
    ironmanCompatibility: "unknown",
    requirements: [],
    questRequirements: [],
    itemRequirements: [],
    equipment: [],
    notes: [],
    confidence: "high",
    uncertaintyNotes: [],
    sourceName: "fixture",
    sourceUrl: "https://example.test/training",
    sourceRevision: "1",
    sourceUpdatedAt: CHECKED_AT,
    lastCheckedAt: CHECKED_AT,
    contentHash: hash,
  });
}

function priceItem(
  itemId: number,
  name = `Item ${itemId}`,
  hash = "d".repeat(64),
): PriceCatalogueItem {
  return PriceCatalogueItemSchema.parse({
    itemId,
    name,
    aliases: itemId === 1 ? ["Alias one"] : [],
    currentPrice: itemId * 100,
    timestamp: CHECKED_AT,
    sourceName: "fixture",
    sourceUrl: "https://example.test/prices",
    retrievedAt: CHECKED_AT,
    contentHash: hash,
  });
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
  for (const filename of temporaryFiles.splice(0)) {
    for (const candidate of [filename, `${filename}-shm`, `${filename}-wal`]) {
      if (existsSync(candidate)) {
        unlinkSync(candidate);
      }
    }
  }
});

describe("SQLite migrations and repositories", () => {
  it("applies migrations transactionally to a new database", () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    expect(getDatabaseSchemaVersion(database)).toBe(4);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'player_profiles'")
        .get(),
    ).toBeTruthy();
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ge_items'")
        .get(),
    ).toBeTruthy();
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quests'")
        .get(),
    ).toBeTruthy();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'training_methods'",
        )
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

  it("creates a consistent pre-migration database backup", async () => {
    const source = join(tmpdir(), `gielinor-source-${randomUUID()}.db`);
    const destination = join(tmpdir(), `gielinor-backup-${randomUUID()}.db`);
    temporaryFiles.push(source, destination);
    const database = openDatabase(source);
    databases.push(database);
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: "BackupTest",
      gameMode: "normal",
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    });
    await new SqlitePlayerProfileRepository(database).create(profile);
    database.close();
    databases.splice(databases.indexOf(database), 1);

    await backupDatabase(source, destination);
    const backup = openDatabase(destination);
    databases.push(backup);
    expect(await new SqlitePlayerProfileRepository(backup).getById(profile.id)).toEqual(profile);
  });
});

describe("SQLite quest snapshot repository", () => {
  it("tracks inserted, unchanged, and changed quest revisions", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteQuestRepository(database);

    expect(
      await repository.replaceSnapshot(snapshot([quest("one", { aliases: ["First"] })])),
    ).toMatchObject({
      inserted: 1,
      updated: 0,
      unchanged: 0,
    });
    expect(
      await repository.replaceSnapshot(
        snapshot([quest("one", { aliases: ["First"], revision: "2" })], "snapshot-2"),
      ),
    ).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 1,
    });
    expect((await repository.getByIdOrAlias("First"))?.sourceRevision).toBe("2");
    expect((await repository.search("first", 10)).map((entry) => entry.id)).toEqual(["one"]);

    expect(
      await repository.replaceSnapshot(
        snapshot(
          [quest("one", { name: "One changed", aliases: ["First"], hash: "b".repeat(64) })],
          "snapshot-3",
        ),
      ),
    ).toMatchObject({
      inserted: 0,
      updated: 1,
      unchanged: 0,
    });
    expect((await repository.getByIdOrAlias("one"))?.name).toBe("One changed");
  });

  it("retains the previous valid snapshot when a replacement fails validation", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteQuestRepository(database);
    await repository.replaceSnapshot(snapshot([quest("stable", { aliases: ["Original"] })]));

    await expect(
      repository.replaceSnapshot(
        snapshot([
          quest("conflict-one", { aliases: ["Shared"] }),
          quest("conflict-two", { aliases: ["Shared"] }),
        ]),
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUEST_SNAPSHOT" });

    expect((await repository.list()).map((entry) => entry.id)).toEqual(["stable"]);
    expect((await repository.getByIdOrAlias("Original"))?.id).toBe("stable");
  });

  it("rejects empty and suspiciously incomplete snapshots without deleting valid quests", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteQuestRepository(database);
    const initial = Array.from({ length: 20 }, (_, index) =>
      quest(`quest-${index}`, { hash: index.toString(16).padStart(64, "0") }),
    );
    await repository.replaceSnapshot(snapshot(initial));

    expect(() =>
      QuestDataSnapshotSchema.parse({
        provider: "fixture",
        sourceUrl: "https://example.test/quests",
        sourceRevision: "empty",
        retrievedAt: CHECKED_AT,
        quests: [],
      }),
    ).toThrow();
    await expect(
      repository.replaceSnapshot(snapshot([quest("quest-0")], "incomplete")),
    ).rejects.toMatchObject({ code: "SUSPICIOUS_QUEST_SNAPSHOT" });
    expect(await repository.list()).toHaveLength(20);
  });

  it("records refresh failure without losing the last successful revision", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteQuestRepository(database);
    await repository.replaceSnapshot(snapshot([quest("stable")], "good-revision"));
    await repository.recordSyncFailure(
      "PROVIDER_TIMEOUT",
      "RuneScape Wiki timed out",
      "2026-07-23T13:00:00.000Z",
    );

    expect(await repository.getDataStatus()).toEqual({
      state: "failed",
      provider: "fixture",
      sourceRevision: "good-revision",
      lastAttemptAt: "2026-07-23T13:00:00.000Z",
      lastSuccessfulSyncAt: CHECKED_AT,
      questCount: 1,
      lastErrorCode: "PROVIDER_TIMEOUT",
      lastErrorMessage: "RuneScape Wiki timed out",
    });
    expect((await repository.getByIdOrAlias("stable"))?.id).toBe("stable");
  });
});

describe("SQLite training snapshot repository", () => {
  it("replaces snapshots transactionally and reports source-aware status", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteTrainingMethodRepository(database);
    const first = TrainingDataSnapshotSchema.parse({
      provider: "fixture",
      sourceUrl: "https://example.test/training",
      sourceRevision: "revision-1",
      retrievedAt: CHECKED_AT,
      methods: [trainingMethod("copper")],
    });
    expect(await repository.replaceSnapshot(first)).toMatchObject({
      inserted: 1,
      updated: 0,
      unchanged: 0,
    });
    expect((await repository.list({ skillId: "mining", level: 1 }))[0]?.id).toBe("copper");
    expect(await repository.getDataStatus()).toEqual({
      state: "ready",
      provider: "fixture",
      sourceRevision: "revision-1",
      lastAttemptAt: CHECKED_AT,
      lastSuccessfulSyncAt: CHECKED_AT,
      methodCount: 1,
      coveredSkills: ["mining"],
    });

    const changed = TrainingDataSnapshotSchema.parse({
      ...first,
      sourceRevision: "revision-2",
      methods: [trainingMethod("copper", "d".repeat(64))],
    });
    expect(await repository.replaceSnapshot(changed)).toMatchObject({
      inserted: 0,
      updated: 1,
      unchanged: 0,
    });
  });

  it("retains the prior training snapshot after suspicious truncation or failure", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteTrainingMethodRepository(database);
    const methods = Array.from({ length: 20 }, (_, index) =>
      trainingMethod(`method-${index}`, index.toString(16).padStart(64, "0")),
    );
    await repository.replaceSnapshot(
      TrainingDataSnapshotSchema.parse({
        provider: "fixture",
        sourceUrl: "https://example.test/training",
        sourceRevision: "good",
        retrievedAt: CHECKED_AT,
        methods,
      }),
    );
    await expect(
      repository.replaceSnapshot(
        TrainingDataSnapshotSchema.parse({
          provider: "fixture",
          sourceUrl: "https://example.test/training",
          sourceRevision: "truncated",
          retrievedAt: CHECKED_AT,
          methods: [methods[0]],
        }),
      ),
    ).rejects.toMatchObject({ code: "SUSPICIOUS_TRAINING_SNAPSHOT" });
    await repository.recordSyncFailure(
      "MALFORMED_TRAINING_DATA",
      "bad data",
      "2026-07-23T13:00:00.000Z",
    );
    expect(await repository.list()).toHaveLength(20);
    expect(await repository.getDataStatus()).toMatchObject({
      state: "failed",
      sourceRevision: "good",
      methodCount: 20,
      lastErrorCode: "MALFORMED_TRAINING_DATA",
    });
  });
});

describe("SQLite Grand Exchange repository", () => {
  it("stores searchable aliases, ordered history, and source-aware status", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqlitePriceRepository(database);
    const snapshot = PriceDataSnapshotSchema.parse({
      provider: "fixture GE",
      sourceRevision: "1700000000",
      sourceUpdatedAt: CHECKED_AT,
      retrievedAt: CHECKED_AT,
      items: [priceItem(1, "Abyssal whip"), priceItem(2, "Coal")],
    });
    expect(await repository.replaceSnapshot(snapshot)).toMatchObject({
      total: 2,
      inserted: 2,
      updated: 0,
    });
    expect((await repository.getByIdOrAlias("Alias one"))?.itemId).toBe(1);
    expect((await repository.search("whip", 10))[0]?.name).toBe("Abyssal whip");

    await repository.replacePriceHistory(
      1,
      [
        { timestamp: "2026-07-22T00:00:00.000Z", price: 90, averagePrice: 85 },
        { timestamp: "2026-07-23T00:00:00.000Z", price: 100, averagePrice: 90 },
      ],
      CHECKED_AT,
      "Jagex graph",
    );
    expect(await repository.getPriceHistory(1)).toMatchObject({
      itemId: 1,
      sourceName: "Jagex graph",
      points: [{ price: 90 }, { price: 100 }],
    });
    expect(await repository.getDataStatus()).toMatchObject({
      state: "ready",
      provider: "fixture GE",
      itemCount: 2,
      historyItemCount: 1,
      historyPointCount: 2,
      newestHistoryAt: "2026-07-23T00:00:00.000Z",
    });
  });

  it("retains a complete price snapshot after suspicious truncation and records failure", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqlitePriceRepository(database);
    const items = Array.from({ length: 1_000 }, (_, index) =>
      priceItem(index + 1, `Item ${index + 1}`, index.toString(16).padStart(64, "0")),
    );
    await repository.replaceSnapshot(
      PriceDataSnapshotSchema.parse({
        provider: "fixture GE",
        sourceRevision: "good",
        sourceUpdatedAt: CHECKED_AT,
        retrievedAt: CHECKED_AT,
        items,
      }),
    );
    await expect(
      repository.replaceSnapshot(
        PriceDataSnapshotSchema.parse({
          provider: "fixture GE",
          sourceRevision: "truncated",
          sourceUpdatedAt: CHECKED_AT,
          retrievedAt: CHECKED_AT,
          items: items.slice(0, 1),
        }),
      ),
    ).rejects.toMatchObject({ code: "SUSPICIOUS_PRICE_SNAPSHOT" });
    await repository.recordSyncFailure(
      "PROVIDER_TIMEOUT",
      "GE provider timed out",
      "2026-07-23T13:00:00.000Z",
    );
    expect((await repository.search("Item", 100)).length).toBe(100);
    expect(await repository.getDataStatus()).toMatchObject({
      state: "failed",
      sourceRevision: "good",
      itemCount: 1_000,
      lastErrorCode: "PROVIDER_TIMEOUT",
    });
  });
});
