import type {
  PlayerProfileRepository,
  PriceRepository,
  QuestRepository,
  TrainingMethodRepository,
} from "@gielinor/core";
import { CompanionError, NotFoundError } from "@gielinor/core";
import type {
  CacheEntry,
  CacheQuarantineRecord,
  CacheRefreshFailure,
  CacheStore,
} from "@gielinor/providers";
import {
  createTraceId,
  PlayerProfileSchema,
  PriceCatalogueItemSchema,
  PriceDataSnapshotSchema,
  PriceDataStatusSchema,
  PricePointSchema,
  PriceSyncResultSchema,
  QuestDataSnapshotSchema,
  QuestDataStatusSchema,
  QuestSchema,
  QuestSyncResultSchema,
  SkillIdSchema,
  StoredPriceHistorySchema,
  TrainingDataSnapshotSchema,
  TrainingDataStatusSchema,
  TrainingMethodSchema,
  TrainingSyncResultSchema,
  type PlayerProfile,
  type PriceCatalogueItem,
  type PriceDataSnapshot,
  type PriceDataStatus,
  type PricePoint,
  type PriceSyncResult,
  type Quest,
  type QuestDataSnapshot,
  type QuestDataStatus,
  type QuestSyncResult,
  type SkillId,
  type StoredPriceHistory,
  type TrainingDataSnapshot,
  type TrainingDataStatus,
  type TrainingMethod,
  type TrainingSyncResult,
} from "@gielinor/shared-types";

import type { DatabaseConnection } from "./connection.js";

type ProfileRow = {
  profile_json: string;
};

type CacheRow = {
  value_json: string;
  metadata_version: number;
  provider: string;
  fetched_at: number;
  stored_at: number;
  fresh_until: number;
  stale_until: number;
  last_successful_refresh_at: number;
  last_failed_refresh_at: number | null;
  last_failure_code: string | null;
  last_failure_trace_id: string | null;
};

type CacheQuarantineRow = {
  quarantine_id: string;
  provider: string;
  quarantined_at: number;
  stored_at: number;
  error_code: "GC-CACHE-004" | "GC-CACHE-005";
  reason: string;
  sample_json: string | null;
};

type CacheRestoreRow = {
  cache_key: string;
  entry_json: string;
};

type QuestRow = {
  quest_json: string;
};

type QuestHashRow = {
  id: string;
  content_hash: string;
};

type QuestSyncStatusRow = {
  state: "ready" | "failed";
  provider: string | null;
  source_revision: string | null;
  last_attempt_at: string;
  last_successful_sync_at: string | null;
  quest_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
};

type TrainingMethodRow = {
  method_json: string;
};

type TrainingMethodHashRow = {
  id: string;
  content_hash: string;
};

type TrainingSyncStatusRow = {
  state: "ready" | "failed";
  provider: string | null;
  source_revision: string | null;
  last_attempt_at: string;
  last_successful_sync_at: string | null;
  method_count: number;
  covered_skills_json: string;
  last_error_code: string | null;
  last_error_message: string | null;
};

type PriceItemRow = {
  item_json: string;
};

type PriceItemHashRow = {
  item_id: number;
  content_hash: string;
};

type PriceSyncStatusRow = {
  state: "ready" | "failed";
  provider: string | null;
  source_revision: string | null;
  source_updated_at: string | null;
  last_attempt_at: string;
  last_successful_sync_at: string | null;
  item_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
};

type PriceHistoryRow = {
  item_id: number;
  timestamp: string;
  price: number;
  average_price: number | null;
  volume: number | null;
  retrieved_at: string;
  source_name: string;
};

function parseProfile(row: ProfileRow): PlayerProfile {
  try {
    return PlayerProfileSchema.parse(JSON.parse(row.profile_json));
  } catch (error) {
    throw new CompanionError("Stored player profile is invalid", "INVALID_STORED_DATA", {
      cause: error,
    });
  }
}

function parseQuest(row: QuestRow): Quest {
  try {
    return QuestSchema.parse(JSON.parse(row.quest_json));
  } catch (error) {
    throw new CompanionError("Stored quest data is invalid", "INVALID_STORED_DATA", {
      cause: error,
    });
  }
}

function parseTrainingMethod(row: TrainingMethodRow): TrainingMethod {
  try {
    return TrainingMethodSchema.parse(JSON.parse(row.method_json));
  } catch (error) {
    throw new CompanionError("Stored training method is invalid", "INVALID_STORED_DATA", {
      cause: error,
    });
  }
}

function parsePriceItem(row: PriceItemRow): PriceCatalogueItem {
  try {
    return PriceCatalogueItemSchema.parse(JSON.parse(row.item_json));
  } catch (error) {
    throw new CompanionError("Stored Grand Exchange item is invalid", "INVALID_STORED_DATA", {
      cause: error,
    });
  }
}

function aliasKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class SqlitePlayerProfileRepository implements PlayerProfileRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public async create(profile: PlayerProfile): Promise<PlayerProfile> {
    const validated = PlayerProfileSchema.parse(profile);
    const now = new Date().toISOString();

    try {
      this.database
        .prepare(
          `INSERT INTO player_profiles
             (id, display_name, profile_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(validated.id, validated.displayName, JSON.stringify(validated), now, now);
    } catch (error) {
      throw new CompanionError("Could not create player profile", "DATABASE_WRITE_FAILED", {
        cause: error,
      });
    }

    return validated;
  }

  public async getById(id: string): Promise<PlayerProfile | null> {
    const row = this.database
      .prepare("SELECT profile_json FROM player_profiles WHERE id = ?")
      .get(id) as ProfileRow | undefined;
    return row === undefined ? null : parseProfile(row);
  }

  public async list(): Promise<PlayerProfile[]> {
    const rows = this.database
      .prepare("SELECT profile_json FROM player_profiles ORDER BY display_name COLLATE NOCASE")
      .all() as ProfileRow[];
    return rows.map(parseProfile);
  }

  public async save(profile: PlayerProfile): Promise<PlayerProfile> {
    const validated = PlayerProfileSchema.parse(profile);
    const result = this.database
      .prepare(
        `UPDATE player_profiles
         SET display_name = ?, profile_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        validated.displayName,
        JSON.stringify(validated),
        new Date().toISOString(),
        validated.id,
      );

    if (result.changes === 0) {
      throw new NotFoundError("Player profile");
    }
    return validated;
  }
}

export class SqliteCacheStore implements CacheStore {
  public constructor(private readonly database: DatabaseConnection) {}

  public async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const row = this.database
      .prepare(
        `SELECT value_json, metadata_version, provider, fetched_at, stored_at,
                fresh_until, stale_until, last_successful_refresh_at,
                last_failed_refresh_at, last_failure_code, last_failure_trace_id
         FROM provider_cache
         WHERE cache_key = ?`,
      )
      .get(key) as CacheRow | undefined;

    if (row === undefined) {
      return null;
    }

    try {
      return {
        metadataVersion: 1,
        value: JSON.parse(row.value_json) as T,
        provider: row.provider,
        fetchedAt: row.fetched_at,
        storedAt: row.stored_at,
        freshUntil: row.fresh_until,
        staleUntil: row.stale_until,
        lastSuccessfulRefreshAt: row.last_successful_refresh_at,
        ...(row.last_failed_refresh_at === null
          ? {}
          : { lastFailedRefreshAt: row.last_failed_refresh_at }),
        ...(row.last_failure_code === null
          ? {}
          : {
              lastFailureCode: row.last_failure_code as NonNullable<
                CacheEntry<T>["lastFailureCode"]
              >,
            }),
        ...(row.last_failure_trace_id === null
          ? {}
          : { lastFailureTraceId: row.last_failure_trace_id }),
      };
    } catch {
      const quarantineId = createTraceId();
      this.database.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO provider_cache_quarantine
               (quarantine_id, cache_key, provider, quarantined_at, stored_at,
                error_code, reason, sample_json, entry_json)
             VALUES (?, ?, ?, ?, ?, 'GC-CACHE-005', ?, ?, ?)`,
          )
          .run(
            quarantineId,
            key,
            row.provider,
            Date.now(),
            row.stored_at,
            "Cached JSON could not be parsed and was quarantined",
            JSON.stringify({ payload: "[invalid-json]" }),
            JSON.stringify({ row }),
          );
        this.database.prepare("DELETE FROM provider_cache WHERE cache_key = ?").run(key);
      })();
      return null;
    }
  }

  public async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO provider_cache
           (cache_key, value_json, metadata_version, provider, fetched_at,
            stored_at, fresh_until, stale_until, last_successful_refresh_at,
            last_failed_refresh_at, last_failure_code, last_failure_trace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           value_json = excluded.value_json,
           metadata_version = excluded.metadata_version,
           provider = excluded.provider,
           fetched_at = excluded.fetched_at,
           stored_at = excluded.stored_at,
           fresh_until = excluded.fresh_until,
           stale_until = excluded.stale_until,
           last_successful_refresh_at = excluded.last_successful_refresh_at,
           last_failed_refresh_at = excluded.last_failed_refresh_at,
           last_failure_code = excluded.last_failure_code,
           last_failure_trace_id = excluded.last_failure_trace_id`,
      )
      .run(
        key,
        JSON.stringify(entry.value),
        entry.metadataVersion,
        entry.provider,
        entry.fetchedAt,
        entry.storedAt,
        entry.freshUntil,
        entry.staleUntil,
        entry.lastSuccessfulRefreshAt,
        entry.lastFailedRefreshAt ?? null,
        entry.lastFailureCode ?? null,
        entry.lastFailureTraceId ?? null,
      );
  }

  public async quarantine<T>(
    key: string,
    entry: CacheEntry<T>,
    record: CacheQuarantineRecord,
    removeActive = true,
  ): Promise<void> {
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO provider_cache_quarantine
             (quarantine_id, cache_key, provider, quarantined_at, stored_at,
              error_code, reason, sample_json, entry_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.quarantineId,
          key,
          record.provider,
          record.quarantinedAt,
          record.storedAt,
          record.errorCode,
          record.reason,
          record.sample === undefined ? null : JSON.stringify(record.sample),
          JSON.stringify(entry),
        );
      if (removeActive) {
        this.database.prepare("DELETE FROM provider_cache WHERE cache_key = ?").run(key);
      }
    })();
  }

  public async recordRefreshFailure(key: string, failure: CacheRefreshFailure): Promise<void> {
    this.database
      .prepare(
        `UPDATE provider_cache
         SET last_failed_refresh_at = ?,
             last_failure_code = ?,
             last_failure_trace_id = ?
         WHERE cache_key = ?`,
      )
      .run(failure.failedAt, failure.code, failure.traceId, key);
  }

  public async listQuarantined(): Promise<CacheQuarantineRecord[]> {
    const rows = this.database
      .prepare(
        `SELECT quarantine_id, provider, quarantined_at, stored_at,
                error_code, reason, sample_json
         FROM provider_cache_quarantine
         ORDER BY quarantined_at DESC`,
      )
      .all() as CacheQuarantineRow[];
    return rows.map((row) => ({
      quarantineId: row.quarantine_id,
      provider: row.provider,
      quarantinedAt: row.quarantined_at,
      storedAt: row.stored_at,
      errorCode: row.error_code,
      reason: row.reason,
      ...(row.sample_json === null
        ? {}
        : {
            sample: JSON.parse(row.sample_json) as Record<string, unknown>,
          }),
    }));
  }

  public async restoreQuarantined(quarantineId: string): Promise<boolean> {
    const row = this.database
      .prepare(
        `SELECT cache_key, entry_json
         FROM provider_cache_quarantine
         WHERE quarantine_id = ?`,
      )
      .get(quarantineId) as CacheRestoreRow | undefined;
    if (row === undefined) {
      return false;
    }
    let entry: CacheEntry<unknown>;
    try {
      entry = JSON.parse(row.entry_json) as CacheEntry<unknown>;
      if (
        entry.metadataVersion !== 1 ||
        typeof entry.provider !== "string" ||
        !Number.isSafeInteger(entry.storedAt)
      ) {
        return false;
      }
    } catch {
      return false;
    }
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO provider_cache
             (cache_key, value_json, metadata_version, provider, fetched_at,
              stored_at, fresh_until, stale_until, last_successful_refresh_at,
              last_failed_refresh_at, last_failure_code, last_failure_trace_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             value_json = excluded.value_json,
             metadata_version = excluded.metadata_version,
             provider = excluded.provider,
             fetched_at = excluded.fetched_at,
             stored_at = excluded.stored_at,
             fresh_until = excluded.fresh_until,
             stale_until = excluded.stale_until,
             last_successful_refresh_at = excluded.last_successful_refresh_at,
             last_failed_refresh_at = excluded.last_failed_refresh_at,
             last_failure_code = excluded.last_failure_code,
             last_failure_trace_id = excluded.last_failure_trace_id`,
        )
        .run(
          row.cache_key,
          JSON.stringify(entry.value),
          entry.metadataVersion,
          entry.provider,
          entry.fetchedAt,
          entry.storedAt,
          entry.freshUntil,
          entry.staleUntil,
          entry.lastSuccessfulRefreshAt,
          entry.lastFailedRefreshAt ?? null,
          entry.lastFailureCode ?? null,
          entry.lastFailureTraceId ?? null,
        );
      this.database
        .prepare("DELETE FROM provider_cache_quarantine WHERE quarantine_id = ?")
        .run(quarantineId);
    })();
    return true;
  }

  public async clearExpiredQuarantine(cutoffAt: number): Promise<number> {
    if (!Number.isSafeInteger(cutoffAt) || cutoffAt < 0) {
      throw new RangeError("Quarantine cutoff must be a non-negative integer timestamp");
    }
    return this.database
      .prepare("DELETE FROM provider_cache_quarantine WHERE quarantined_at < ?")
      .run(cutoffAt).changes;
  }
}

export class SqliteQuestRepository implements QuestRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public async getByIdOrAlias(identifier: string): Promise<Quest | null> {
    const direct = this.database
      .prepare("SELECT quest_json FROM quests WHERE id = ? COLLATE NOCASE")
      .get(identifier) as QuestRow | undefined;
    if (direct !== undefined) {
      return parseQuest(direct);
    }

    const alias = this.database
      .prepare(
        `SELECT q.quest_json
         FROM quest_aliases AS a
         JOIN quests AS q ON q.id = a.quest_id
         WHERE a.alias_key = ?`,
      )
      .get(aliasKey(identifier)) as QuestRow | undefined;
    return alias === undefined ? null : parseQuest(alias);
  }

  public async list(): Promise<Quest[]> {
    const rows = this.database
      .prepare("SELECT quest_json FROM quests ORDER BY name COLLATE NOCASE")
      .all() as QuestRow[];
    return rows.map(parseQuest);
  }

  public async search(query: string, limit: number): Promise<Quest[]> {
    const needle = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const rows = this.database
      .prepare(
        `SELECT DISTINCT q.quest_json
         FROM quests AS q
         LEFT JOIN quest_aliases AS a ON a.quest_id = q.id
         WHERE q.name LIKE ? ESCAPE '\\' COLLATE NOCASE
            OR q.id LIKE ? ESCAPE '\\' COLLATE NOCASE
            OR a.alias LIKE ? ESCAPE '\\' COLLATE NOCASE
         ORDER BY q.name COLLATE NOCASE
         LIMIT ?`,
      )
      .all(needle, needle, needle, limit) as QuestRow[];
    return rows.map(parseQuest);
  }

  public async replaceSnapshot(snapshot: QuestDataSnapshot): Promise<QuestSyncResult> {
    const validated = QuestDataSnapshotSchema.parse(snapshot);
    const questIds = new Set<string>();
    const aliasOwners = new Map<string, string>();

    for (const quest of validated.quests) {
      if (questIds.has(quest.id)) {
        throw new CompanionError(
          `Quest snapshot contains duplicate ID ${quest.id}`,
          "INVALID_QUEST_SNAPSHOT",
        );
      }
      questIds.add(quest.id);
      for (const alias of [quest.id, quest.name, ...quest.aliases]) {
        const key = aliasKey(alias);
        const owner = aliasOwners.get(key);
        if (owner !== undefined && owner !== quest.id) {
          throw new CompanionError(`Quest alias "${alias}" is ambiguous`, "INVALID_QUEST_SNAPSHOT");
        }
        aliasOwners.set(key, quest.id);
      }
    }

    const existingRows = this.database
      .prepare("SELECT id, content_hash FROM quests")
      .all() as QuestHashRow[];
    if (
      existingRows.length >= 20 &&
      validated.quests.length < Math.floor(existingRows.length * 0.8)
    ) {
      throw new CompanionError(
        "Quest refresh returned a suspiciously incomplete snapshot; previous data was retained",
        "SUSPICIOUS_QUEST_SNAPSHOT",
      );
    }
    const existing = new Map(existingRows.map((row) => [row.id, row.content_hash]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const removed = existingRows.filter((row) => !questIds.has(row.id)).length;

    this.database.transaction(() => {
      const upsert = this.database.prepare(
        `INSERT INTO quests
           (id, name, quest_json, content_hash, source_revision, source_updated_at, last_checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           quest_json = excluded.quest_json,
           content_hash = excluded.content_hash,
           source_revision = excluded.source_revision,
           source_updated_at = excluded.source_updated_at,
           last_checked_at = excluded.last_checked_at`,
      );
      for (const quest of validated.quests) {
        const previousHash = existing.get(quest.id);
        if (previousHash === undefined) {
          inserted += 1;
        } else if (previousHash === quest.contentHash) {
          unchanged += 1;
        } else {
          updated += 1;
        }
        upsert.run(
          quest.id,
          quest.name,
          JSON.stringify(quest),
          quest.contentHash,
          quest.sourceRevision ?? null,
          quest.sourceUpdatedAt ?? null,
          quest.lastCheckedAt,
        );
      }

      if (removed > 0) {
        const placeholders = [...questIds].map(() => "?").join(",");
        if (placeholders.length === 0) {
          this.database.prepare("DELETE FROM quests").run();
        } else {
          this.database
            .prepare(`DELETE FROM quests WHERE id NOT IN (${placeholders})`)
            .run(...questIds);
        }
      }

      this.database.prepare("DELETE FROM quest_aliases").run();
      const insertAlias = this.database.prepare(
        `INSERT INTO quest_aliases (alias_key, alias, quest_id)
         VALUES (?, ?, ?)`,
      );
      for (const quest of validated.quests) {
        const aliases = new Map<string, string>();
        for (const alias of [quest.id, quest.name, ...quest.aliases]) {
          aliases.set(aliasKey(alias), alias);
        }
        for (const [key, alias] of aliases) {
          insertAlias.run(key, alias, quest.id);
        }
      }

      this.database
        .prepare(
          `INSERT INTO quest_sync_status
             (singleton_id, state, provider, source_revision, last_attempt_at,
              last_successful_sync_at, quest_count, last_error_code, last_error_message)
           VALUES (1, 'ready', ?, ?, ?, ?, ?, NULL, NULL)
           ON CONFLICT(singleton_id) DO UPDATE SET
             state = 'ready',
             provider = excluded.provider,
             source_revision = excluded.source_revision,
             last_attempt_at = excluded.last_attempt_at,
             last_successful_sync_at = excluded.last_successful_sync_at,
             quest_count = excluded.quest_count,
             last_error_code = NULL,
             last_error_message = NULL`,
        )
        .run(
          validated.provider,
          validated.sourceRevision,
          validated.retrievedAt,
          validated.retrievedAt,
          validated.quests.length,
        );
    })();

    return QuestSyncResultSchema.parse({
      provider: validated.provider,
      sourceRevision: validated.sourceRevision,
      checkedAt: validated.retrievedAt,
      total: validated.quests.length,
      inserted,
      updated,
      unchanged,
      removed,
    });
  }

  public async getDataStatus(): Promise<QuestDataStatus> {
    const row = this.database
      .prepare(
        `SELECT state, provider, source_revision, last_attempt_at, last_successful_sync_at,
                quest_count, last_error_code, last_error_message
         FROM quest_sync_status
         WHERE singleton_id = 1`,
      )
      .get() as QuestSyncStatusRow | undefined;
    if (row === undefined) {
      return QuestDataStatusSchema.parse({
        state: "never-synced",
        questCount: 0,
      });
    }
    return QuestDataStatusSchema.parse({
      state: row.state,
      ...(row.provider === null ? {} : { provider: row.provider }),
      ...(row.source_revision === null ? {} : { sourceRevision: row.source_revision }),
      lastAttemptAt: row.last_attempt_at,
      ...(row.last_successful_sync_at === null
        ? {}
        : { lastSuccessfulSyncAt: row.last_successful_sync_at }),
      questCount: row.quest_count,
      ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
      ...(row.last_error_message === null ? {} : { lastErrorMessage: row.last_error_message }),
    });
  }

  public async recordSyncFailure(
    code: string,
    message: string,
    attemptedAt: string,
  ): Promise<void> {
    const count = (
      this.database.prepare("SELECT COUNT(*) AS count FROM quests").get() as { count: number }
    ).count;
    this.database
      .prepare(
        `INSERT INTO quest_sync_status
           (singleton_id, state, last_attempt_at, quest_count, last_error_code, last_error_message)
         VALUES (1, 'failed', ?, ?, ?, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET
           state = 'failed',
           last_attempt_at = excluded.last_attempt_at,
           quest_count = excluded.quest_count,
           last_error_code = excluded.last_error_code,
           last_error_message = excluded.last_error_message`,
      )
      .run(attemptedAt, count, code, message);
  }
}

export class SqliteTrainingMethodRepository implements TrainingMethodRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public async getById(id: string): Promise<TrainingMethod | null> {
    const row = this.database
      .prepare("SELECT method_json FROM training_methods WHERE id = ? COLLATE NOCASE")
      .get(id) as TrainingMethodRow | undefined;
    return row === undefined ? null : parseTrainingMethod(row);
  }

  public async list(
    filters: {
      skillId?: SkillId | undefined;
      level?: number | undefined;
    } = {},
  ): Promise<TrainingMethod[]> {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.skillId !== undefined) {
      clauses.push("skill_id = ?");
      values.push(SkillIdSchema.parse(filters.skillId));
    }
    if (filters.level !== undefined) {
      if (!Number.isInteger(filters.level) || filters.level < 1 || filters.level > 150) {
        throw new CompanionError("Training level must be from 1 to 150", "INVALID_LEVEL");
      }
      clauses.push("minimum_level <= ?");
      clauses.push("(maximum_level IS NULL OR maximum_level >= ?)");
      values.push(filters.level, filters.level);
    }
    const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
    const rows = this.database
      .prepare(
        `SELECT method_json
         FROM training_methods
         ${where}
         ORDER BY skill_id, minimum_level, id`,
      )
      .all(...values) as TrainingMethodRow[];
    return rows.map(parseTrainingMethod);
  }

  public async replaceSnapshot(snapshot: TrainingDataSnapshot): Promise<TrainingSyncResult> {
    const validated = TrainingDataSnapshotSchema.parse(snapshot);
    const ids = new Set<string>();
    for (const method of validated.methods) {
      if (ids.has(method.id)) {
        throw new CompanionError(
          `Training snapshot contains duplicate ID ${method.id}`,
          "INVALID_TRAINING_SNAPSHOT",
        );
      }
      ids.add(method.id);
    }
    const existingRows = this.database
      .prepare("SELECT id, content_hash FROM training_methods")
      .all() as TrainingMethodHashRow[];
    if (
      existingRows.length >= 20 &&
      validated.methods.length < Math.floor(existingRows.length * 0.8)
    ) {
      throw new CompanionError(
        "Training refresh returned a suspiciously incomplete snapshot; previous data was retained",
        "SUSPICIOUS_TRAINING_SNAPSHOT",
      );
    }
    const existing = new Map(existingRows.map((row) => [row.id, row.content_hash]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const removed = existingRows.filter((row) => !ids.has(row.id)).length;
    const coveredSkills = [...new Set(validated.methods.map((method) => method.skillId))].sort();

    this.database.transaction(() => {
      const upsert = this.database.prepare(
        `INSERT INTO training_methods
           (id, skill_id, minimum_level, maximum_level, method_json, content_hash,
            source_revision, source_updated_at, last_checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           skill_id = excluded.skill_id,
           minimum_level = excluded.minimum_level,
           maximum_level = excluded.maximum_level,
           method_json = excluded.method_json,
           content_hash = excluded.content_hash,
           source_revision = excluded.source_revision,
           source_updated_at = excluded.source_updated_at,
           last_checked_at = excluded.last_checked_at`,
      );
      for (const method of validated.methods) {
        const previousHash = existing.get(method.id);
        if (previousHash === undefined) {
          inserted += 1;
        } else if (previousHash === method.contentHash) {
          unchanged += 1;
        } else {
          updated += 1;
        }
        upsert.run(
          method.id,
          method.skillId,
          method.minimumLevel,
          method.maximumLevel ?? null,
          JSON.stringify(method),
          method.contentHash,
          method.sourceRevision,
          method.sourceUpdatedAt,
          method.lastCheckedAt,
        );
      }
      if (removed > 0) {
        const placeholders = [...ids].map(() => "?").join(",");
        this.database
          .prepare(`DELETE FROM training_methods WHERE id NOT IN (${placeholders})`)
          .run(...ids);
      }
      this.database
        .prepare(
          `INSERT INTO training_sync_status
             (singleton_id, state, provider, source_revision, last_attempt_at,
              last_successful_sync_at, method_count, covered_skills_json,
              last_error_code, last_error_message)
           VALUES (1, 'ready', ?, ?, ?, ?, ?, ?, NULL, NULL)
           ON CONFLICT(singleton_id) DO UPDATE SET
             state = 'ready',
             provider = excluded.provider,
             source_revision = excluded.source_revision,
             last_attempt_at = excluded.last_attempt_at,
             last_successful_sync_at = excluded.last_successful_sync_at,
             method_count = excluded.method_count,
             covered_skills_json = excluded.covered_skills_json,
             last_error_code = NULL,
             last_error_message = NULL`,
        )
        .run(
          validated.provider,
          validated.sourceRevision,
          validated.retrievedAt,
          validated.retrievedAt,
          validated.methods.length,
          JSON.stringify(coveredSkills),
        );
    })();

    return TrainingSyncResultSchema.parse({
      provider: validated.provider,
      sourceRevision: validated.sourceRevision,
      checkedAt: validated.retrievedAt,
      total: validated.methods.length,
      inserted,
      updated,
      unchanged,
      removed,
    });
  }

  public async getDataStatus(): Promise<TrainingDataStatus> {
    const row = this.database
      .prepare(
        `SELECT state, provider, source_revision, last_attempt_at, last_successful_sync_at,
                method_count, covered_skills_json, last_error_code, last_error_message
         FROM training_sync_status
         WHERE singleton_id = 1`,
      )
      .get() as TrainingSyncStatusRow | undefined;
    if (row === undefined) {
      return TrainingDataStatusSchema.parse({
        state: "never-synced",
        methodCount: 0,
        coveredSkills: [],
      });
    }
    let coveredSkills: SkillId[];
    try {
      const parsed: unknown = JSON.parse(row.covered_skills_json);
      if (!Array.isArray(parsed)) {
        throw new TypeError("Covered skills must be an array");
      }
      coveredSkills = parsed.map((skillId) => SkillIdSchema.parse(skillId));
    } catch (error) {
      throw new CompanionError("Stored training sync status is invalid", "INVALID_STORED_DATA", {
        cause: error,
      });
    }
    return TrainingDataStatusSchema.parse({
      state: row.state,
      ...(row.provider === null ? {} : { provider: row.provider }),
      ...(row.source_revision === null ? {} : { sourceRevision: row.source_revision }),
      lastAttemptAt: row.last_attempt_at,
      ...(row.last_successful_sync_at === null
        ? {}
        : { lastSuccessfulSyncAt: row.last_successful_sync_at }),
      methodCount: row.method_count,
      coveredSkills,
      ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
      ...(row.last_error_message === null ? {} : { lastErrorMessage: row.last_error_message }),
    });
  }

  public async recordSyncFailure(
    code: string,
    message: string,
    attemptedAt: string,
  ): Promise<void> {
    const rows = this.database
      .prepare("SELECT DISTINCT skill_id FROM training_methods ORDER BY skill_id")
      .all() as Array<{ skill_id: string }>;
    const count = (
      this.database.prepare("SELECT COUNT(*) AS count FROM training_methods").get() as {
        count: number;
      }
    ).count;
    this.database
      .prepare(
        `INSERT INTO training_sync_status
           (singleton_id, state, last_attempt_at, method_count, covered_skills_json,
            last_error_code, last_error_message)
         VALUES (1, 'failed', ?, ?, ?, ?, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET
           state = 'failed',
           last_attempt_at = excluded.last_attempt_at,
           method_count = excluded.method_count,
           covered_skills_json = excluded.covered_skills_json,
           last_error_code = excluded.last_error_code,
           last_error_message = excluded.last_error_message`,
      )
      .run(attemptedAt, count, JSON.stringify(rows.map((row) => row.skill_id)), code, message);
  }
}

export class SqlitePriceRepository implements PriceRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public async getByIdOrAlias(identifier: number | string): Promise<PriceCatalogueItem | null> {
    const numeric =
      typeof identifier === "number"
        ? identifier
        : /^\d+$/.test(identifier.trim())
          ? Number(identifier.trim())
          : undefined;
    if (numeric !== undefined) {
      if (!Number.isSafeInteger(numeric) || numeric <= 0) {
        throw new CompanionError("Item ID must be a positive safe integer", "INVALID_ITEM_ID");
      }
      const row = this.database
        .prepare("SELECT item_json FROM ge_items WHERE item_id = ?")
        .get(numeric) as PriceItemRow | undefined;
      return row === undefined ? null : parsePriceItem(row);
    }

    const rows = this.database
      .prepare(
        `SELECT DISTINCT i.item_json
         FROM ge_item_aliases AS a
         JOIN ge_items AS i ON i.item_id = a.item_id
         WHERE a.alias_key = ?
         ORDER BY i.item_id`,
      )
      .all(aliasKey(String(identifier))) as PriceItemRow[];
    if (rows.length > 1) {
      throw new CompanionError(
        `Item name "${identifier}" is ambiguous; use an item ID`,
        "AMBIGUOUS_ITEM_ALIAS",
      );
    }
    return rows[0] === undefined ? null : parsePriceItem(rows[0]);
  }

  public async search(query: string, limit: number): Promise<PriceCatalogueItem[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new CompanionError("Item search query cannot be empty", "INVALID_ITEM_QUERY");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new CompanionError("Item search limit must be from 1 to 100", "INVALID_LIMIT");
    }
    const escapeLike = (value: string): string =>
      value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const rawNeedle = `%${escapeLike(trimmed)}%`;
    const aliasNeedle = `%${escapeLike(aliasKey(trimmed))}%`;
    const rows = this.database
      .prepare(
        `SELECT DISTINCT i.item_json
         FROM ge_items AS i
         LEFT JOIN ge_item_aliases AS a ON a.item_id = i.item_id
         WHERE i.name LIKE ? ESCAPE '\\' COLLATE NOCASE
            OR a.alias LIKE ? ESCAPE '\\' COLLATE NOCASE
            OR a.alias_key LIKE ? ESCAPE '\\'
            OR CAST(i.item_id AS TEXT) = ?
         ORDER BY
           CASE WHEN i.name = ? COLLATE NOCASE THEN 0 ELSE 1 END,
           i.name COLLATE NOCASE,
           i.item_id
         LIMIT ?`,
      )
      .all(rawNeedle, rawNeedle, aliasNeedle, trimmed, trimmed, limit) as PriceItemRow[];
    return rows.map(parsePriceItem);
  }

  public async replaceSnapshot(snapshot: PriceDataSnapshot): Promise<PriceSyncResult> {
    const validated = PriceDataSnapshotSchema.parse(snapshot);
    const ids = new Set<number>();
    for (const item of validated.items) {
      if (ids.has(item.itemId)) {
        throw new CompanionError(
          `Price snapshot contains duplicate item ID ${item.itemId}`,
          "INVALID_PRICE_SNAPSHOT",
        );
      }
      ids.add(item.itemId);
    }
    const existingRows = this.database
      .prepare("SELECT item_id, content_hash FROM ge_items")
      .all() as PriceItemHashRow[];
    if (
      existingRows.length >= 1_000 &&
      validated.items.length < Math.floor(existingRows.length * 0.8)
    ) {
      throw new CompanionError(
        "Price refresh returned a suspiciously incomplete snapshot; previous data was retained",
        "SUSPICIOUS_PRICE_SNAPSHOT",
      );
    }
    const existing = new Map(existingRows.map((row) => [row.item_id, row.content_hash]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const removed = existingRows.filter((row) => !ids.has(row.item_id)).length;

    this.database.transaction(() => {
      const upsert = this.database.prepare(
        `INSERT INTO ge_items
           (item_id, name, item_json, content_hash, price_timestamp, source_revision, retrieved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET
           name = excluded.name,
           item_json = excluded.item_json,
           content_hash = excluded.content_hash,
           price_timestamp = excluded.price_timestamp,
           source_revision = excluded.source_revision,
           retrieved_at = excluded.retrieved_at`,
      );
      for (const item of validated.items) {
        const previousHash = existing.get(item.itemId);
        if (previousHash === undefined) {
          inserted += 1;
        } else if (previousHash === item.contentHash) {
          unchanged += 1;
        } else {
          updated += 1;
        }
        upsert.run(
          item.itemId,
          item.name,
          JSON.stringify(item),
          item.contentHash,
          item.timestamp,
          validated.sourceRevision,
          item.retrievedAt,
        );
      }
      if (removed > 0) {
        const placeholders = [...ids].map(() => "?").join(",");
        this.database
          .prepare(`DELETE FROM ge_items WHERE item_id NOT IN (${placeholders})`)
          .run(...ids);
      }

      this.database.prepare("DELETE FROM ge_item_aliases").run();
      const insertAlias = this.database.prepare(
        `INSERT INTO ge_item_aliases (alias_key, alias, item_id)
         VALUES (?, ?, ?)
         ON CONFLICT(alias_key, item_id) DO NOTHING`,
      );
      for (const item of validated.items) {
        const aliases = new Map<string, string>();
        for (const alias of [item.name, ...item.aliases]) {
          aliases.set(aliasKey(alias), alias);
        }
        for (const [key, alias] of aliases) {
          insertAlias.run(key, alias, item.itemId);
        }
      }

      this.database
        .prepare(
          `INSERT INTO ge_sync_status
             (singleton_id, state, provider, source_revision, source_updated_at,
              last_attempt_at, last_successful_sync_at, item_count,
              last_error_code, last_error_message)
           VALUES (1, 'ready', ?, ?, ?, ?, ?, ?, NULL, NULL)
           ON CONFLICT(singleton_id) DO UPDATE SET
             state = 'ready',
             provider = excluded.provider,
             source_revision = excluded.source_revision,
             source_updated_at = excluded.source_updated_at,
             last_attempt_at = excluded.last_attempt_at,
             last_successful_sync_at = excluded.last_successful_sync_at,
             item_count = excluded.item_count,
             last_error_code = NULL,
             last_error_message = NULL`,
        )
        .run(
          validated.provider,
          validated.sourceRevision,
          validated.sourceUpdatedAt,
          validated.retrievedAt,
          validated.retrievedAt,
          validated.items.length,
        );
    })();

    return PriceSyncResultSchema.parse({
      provider: validated.provider,
      sourceRevision: validated.sourceRevision,
      checkedAt: validated.retrievedAt,
      total: validated.items.length,
      inserted,
      updated,
      unchanged,
      removed,
    });
  }

  public async getDataStatus(): Promise<PriceDataStatus> {
    const row = this.database
      .prepare(
        `SELECT state, provider, source_revision, source_updated_at, last_attempt_at,
                last_successful_sync_at, item_count, last_error_code, last_error_message
         FROM ge_sync_status
         WHERE singleton_id = 1`,
      )
      .get() as PriceSyncStatusRow | undefined;
    const history = this.database
      .prepare(
        `SELECT COUNT(DISTINCT item_id) AS item_count,
                COUNT(*) AS point_count,
                MAX(timestamp) AS newest_at
         FROM ge_price_history`,
      )
      .get() as { item_count: number; point_count: number; newest_at: string | null };
    if (row === undefined) {
      return PriceDataStatusSchema.parse({
        state: "never-synced",
        itemCount: 0,
        historyItemCount: history.item_count,
        historyPointCount: history.point_count,
        ...(history.newest_at === null ? {} : { newestHistoryAt: history.newest_at }),
      });
    }
    return PriceDataStatusSchema.parse({
      state: row.state,
      ...(row.provider === null ? {} : { provider: row.provider }),
      ...(row.source_revision === null ? {} : { sourceRevision: row.source_revision }),
      ...(row.source_updated_at === null ? {} : { sourceUpdatedAt: row.source_updated_at }),
      lastAttemptAt: row.last_attempt_at,
      ...(row.last_successful_sync_at === null
        ? {}
        : { lastSuccessfulSyncAt: row.last_successful_sync_at }),
      itemCount: row.item_count,
      historyItemCount: history.item_count,
      historyPointCount: history.point_count,
      ...(history.newest_at === null ? {} : { newestHistoryAt: history.newest_at }),
      ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
      ...(row.last_error_message === null ? {} : { lastErrorMessage: row.last_error_message }),
    });
  }

  public async recordSyncFailure(
    code: string,
    message: string,
    attemptedAt: string,
  ): Promise<void> {
    const count = (
      this.database.prepare("SELECT COUNT(*) AS count FROM ge_items").get() as { count: number }
    ).count;
    this.database
      .prepare(
        `INSERT INTO ge_sync_status
           (singleton_id, state, last_attempt_at, item_count, last_error_code, last_error_message)
         VALUES (1, 'failed', ?, ?, ?, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET
           state = 'failed',
           last_attempt_at = excluded.last_attempt_at,
           item_count = excluded.item_count,
           last_error_code = excluded.last_error_code,
           last_error_message = excluded.last_error_message`,
      )
      .run(attemptedAt, count, code, message);
  }

  public async getPriceHistory(itemId: number): Promise<StoredPriceHistory | null> {
    const rows = this.database
      .prepare(
        `SELECT item_id, timestamp, price, average_price, volume, retrieved_at, source_name
         FROM ge_price_history
         WHERE item_id = ?
         ORDER BY timestamp`,
      )
      .all(itemId) as PriceHistoryRow[];
    if (rows.length === 0) {
      return null;
    }
    const latestRetrieval = rows.reduce((latest, row) =>
      row.retrieved_at > latest.retrieved_at ? row : latest,
    );
    return StoredPriceHistorySchema.parse({
      itemId,
      points: rows.map((row) =>
        PricePointSchema.parse({
          timestamp: row.timestamp,
          price: row.price,
          ...(row.average_price === null ? {} : { averagePrice: row.average_price }),
          ...(row.volume === null ? {} : { volume: row.volume }),
        }),
      ),
      retrievedAt: latestRetrieval.retrieved_at,
      sourceName: latestRetrieval.source_name,
    });
  }

  public async replacePriceHistory(
    itemId: number,
    points: PricePoint[],
    retrievedAt: string,
    sourceName: string,
  ): Promise<StoredPriceHistory> {
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      throw new CompanionError("Item ID must be a positive safe integer", "INVALID_ITEM_ID");
    }
    const validatedPoints = points.map((point) => PricePointSchema.parse(point));
    const timestamps = new Set<string>();
    for (const point of validatedPoints) {
      if (timestamps.has(point.timestamp)) {
        throw new CompanionError(
          `Price history contains duplicate timestamp ${point.timestamp}`,
          "INVALID_PRICE_HISTORY",
        );
      }
      timestamps.add(point.timestamp);
    }
    const validated = StoredPriceHistorySchema.parse({
      itemId,
      points: [...validatedPoints].sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      ),
      retrievedAt,
      sourceName,
    });
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM ge_price_history WHERE item_id = ?").run(itemId);
      const insert = this.database.prepare(
        `INSERT INTO ge_price_history
           (item_id, timestamp, price, average_price, volume, retrieved_at, source_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const point of validated.points) {
        insert.run(
          itemId,
          point.timestamp,
          point.price,
          point.averagePrice ?? null,
          point.volume ?? null,
          validated.retrievedAt,
          validated.sourceName,
        );
      }
    })();
    return validated;
  }
}
