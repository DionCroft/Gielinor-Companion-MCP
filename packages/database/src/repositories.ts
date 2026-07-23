import type { PlayerProfileRepository } from "@gielinor/core";
import { CompanionError, NotFoundError } from "@gielinor/core";
import type { CacheEntry, CacheStore } from "@gielinor/providers";
import { PlayerProfileSchema, type PlayerProfile } from "@gielinor/shared-types";

import type { DatabaseConnection } from "./connection.js";

type ProfileRow = {
  profile_json: string;
};

type CacheRow = {
  value_json: string;
  stored_at: number;
  fresh_until: number;
  stale_until: number;
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
        `SELECT value_json, stored_at, fresh_until, stale_until
         FROM provider_cache
         WHERE cache_key = ?`,
      )
      .get(key) as CacheRow | undefined;

    if (row === undefined) {
      return null;
    }

    try {
      return {
        value: JSON.parse(row.value_json) as T,
        storedAt: row.stored_at,
        freshUntil: row.fresh_until,
        staleUntil: row.stale_until,
      };
    } catch {
      this.database.prepare("DELETE FROM provider_cache WHERE cache_key = ?").run(key);
      return null;
    }
  }

  public async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO provider_cache
           (cache_key, value_json, stored_at, fresh_until, stale_until)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           value_json = excluded.value_json,
           stored_at = excluded.stored_at,
           fresh_until = excluded.fresh_until,
           stale_until = excluded.stale_until`,
      )
      .run(key, JSON.stringify(entry.value), entry.storedAt, entry.freshUntil, entry.staleUntil);
  }
}
