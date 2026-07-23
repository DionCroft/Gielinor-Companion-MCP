import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

export type DatabaseConnection = Database.Database;

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS player_profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_player_profiles_display_name
        ON player_profiles(display_name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS provider_cache (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        stored_at INTEGER NOT NULL,
        fresh_until INTEGER NOT NULL,
        stale_until INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS quests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        quest_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        source_revision TEXT,
        source_updated_at TEXT,
        last_checked_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_quests_name
        ON quests(name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS quest_aliases (
        alias_key TEXT PRIMARY KEY,
        alias TEXT NOT NULL,
        quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_quest_aliases_quest_id
        ON quest_aliases(quest_id);

      CREATE TABLE IF NOT EXISTS quest_sync_status (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        state TEXT NOT NULL CHECK (state IN ('ready', 'failed')),
        provider TEXT,
        source_revision TEXT,
        last_attempt_at TEXT NOT NULL,
        last_successful_sync_at TEXT,
        quest_count INTEGER NOT NULL DEFAULT 0 CHECK (quest_count >= 0),
        last_error_code TEXT,
        last_error_message TEXT
      );
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS training_methods (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        minimum_level INTEGER NOT NULL,
        maximum_level INTEGER,
        method_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        source_updated_at TEXT NOT NULL,
        last_checked_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_training_methods_skill_level
        ON training_methods(skill_id, minimum_level, maximum_level);

      CREATE TABLE IF NOT EXISTS training_sync_status (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        state TEXT NOT NULL CHECK (state IN ('ready', 'failed')),
        provider TEXT,
        source_revision TEXT,
        last_attempt_at TEXT NOT NULL,
        last_successful_sync_at TEXT,
        method_count INTEGER NOT NULL DEFAULT 0 CHECK (method_count >= 0),
        covered_skills_json TEXT NOT NULL DEFAULT '[]',
        last_error_code TEXT,
        last_error_message TEXT
      );
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS ge_items (
        item_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        item_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        price_timestamp TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        retrieved_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ge_items_name
        ON ge_items(name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS ge_item_aliases (
        alias_key TEXT NOT NULL,
        alias TEXT NOT NULL,
        item_id INTEGER NOT NULL REFERENCES ge_items(item_id) ON DELETE CASCADE,
        PRIMARY KEY (alias_key, item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ge_item_aliases_item_id
        ON ge_item_aliases(item_id);

      CREATE TABLE IF NOT EXISTS ge_price_history (
        item_id INTEGER NOT NULL REFERENCES ge_items(item_id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL,
        price INTEGER NOT NULL CHECK (price >= 0),
        average_price INTEGER CHECK (average_price >= 0),
        volume INTEGER CHECK (volume >= 0),
        retrieved_at TEXT NOT NULL,
        source_name TEXT NOT NULL,
        PRIMARY KEY (item_id, timestamp)
      );

      CREATE INDEX IF NOT EXISTS idx_ge_price_history_item_timestamp
        ON ge_price_history(item_id, timestamp);

      CREATE TABLE IF NOT EXISTS ge_sync_status (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        state TEXT NOT NULL CHECK (state IN ('ready', 'failed')),
        provider TEXT,
        source_revision TEXT,
        source_updated_at TEXT,
        last_attempt_at TEXT NOT NULL,
        last_successful_sync_at TEXT,
        item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
        last_error_code TEXT,
        last_error_message TEXT
      );
    `,
  },
];

function migrate(database: DatabaseConnection): void {
  const currentVersion = database.pragma("user_version", { simple: true }) as number;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${migration.version}`);
    })();
  }
}

export function openDatabase(filename: string): DatabaseConnection {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") {
    database.pragma("journal_mode = WAL");
  }
  migrate(database);
  return database;
}

export function getDatabaseSchemaVersion(database: DatabaseConnection): number {
  return database.pragma("user_version", { simple: true }) as number;
}

export async function backupDatabase(
  sourceFilename: string,
  destinationFilename: string,
): Promise<void> {
  mkdirSync(dirname(resolve(destinationFilename)), { recursive: true });
  const database = new Database(sourceFilename);
  try {
    await database.backup(destinationFilename);
  } finally {
    database.close();
  }
}
