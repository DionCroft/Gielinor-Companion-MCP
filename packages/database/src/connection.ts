import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

export type DatabaseConnection = Database.Database;
export const DATABASE_SCHEMA_VERSION = 7;

export type DatabaseMigration = {
  version: number;
  name: string;
  sql: string;
};

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    version: 1,
    name: "profiles-and-provider-cache",
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
    name: "quest-catalogue",
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
    name: "training-methods",
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
    name: "grand-exchange-data",
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
  {
    version: 5,
    name: "operational-query-indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_player_profiles_updated_at
        ON player_profiles(updated_at);

      CREATE INDEX IF NOT EXISTS idx_provider_cache_stale_until
        ON provider_cache(stale_until);

      CREATE INDEX IF NOT EXISTS idx_quests_last_checked_at
        ON quests(last_checked_at);

      CREATE INDEX IF NOT EXISTS idx_training_methods_last_checked_at
        ON training_methods(last_checked_at);

      CREATE INDEX IF NOT EXISTS idx_ge_items_retrieved_at
        ON ge_items(retrieved_at);

      CREATE INDEX IF NOT EXISTS idx_ge_price_history_timestamp
        ON ge_price_history(timestamp);
    `,
  },
  {
    version: 6,
    name: "resilience-maintenance-state",
    sql: `
      ALTER TABLE provider_cache
        ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE provider_cache
        ADD COLUMN provider TEXT NOT NULL DEFAULT 'legacy-provider';
      ALTER TABLE provider_cache
        ADD COLUMN fetched_at INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE provider_cache
        ADD COLUMN last_successful_refresh_at INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE provider_cache
        ADD COLUMN last_failed_refresh_at INTEGER;
      ALTER TABLE provider_cache
        ADD COLUMN last_failure_code TEXT;
      ALTER TABLE provider_cache
        ADD COLUMN last_failure_trace_id TEXT;

      UPDATE provider_cache
      SET fetched_at = stored_at,
          last_successful_refresh_at = stored_at
      WHERE fetched_at = 0 OR last_successful_refresh_at = 0;

      CREATE TABLE provider_cache_quarantine (
        quarantine_id TEXT PRIMARY KEY,
        cache_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        quarantined_at INTEGER NOT NULL,
        stored_at INTEGER NOT NULL,
        error_code TEXT NOT NULL,
        reason TEXT NOT NULL,
        sample_json TEXT,
        entry_json TEXT NOT NULL
      );

      CREATE INDEX idx_provider_cache_quarantine_time
        ON provider_cache_quarantine(quarantined_at DESC);

      CREATE TABLE database_recovery_events (
        event_id TEXT PRIMARY KEY,
        event_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'recovered', 'safe-mode')),
        error_code TEXT,
        action TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX idx_database_recovery_events_time
        ON database_recovery_events(event_at DESC);

      CREATE TABLE system_state (
        state_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE maintenance_jobs (
        job_name TEXT PRIMARY KEY CHECK (
          job_name IN (
            'quest-refresh',
            'training-refresh',
            'price-refresh',
            'software-update-check'
          )
        ),
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
        updated_at INTEGER NOT NULL,
        CHECK (
          (state = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
          OR state != 'running'
        )
      );

      CREATE INDEX idx_maintenance_jobs_due
        ON maintenance_jobs(enabled, next_run_at, lease_expires_at);

      CREATE TABLE maintenance_job_attempts (
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

      CREATE INDEX idx_maintenance_job_attempts_time
        ON maintenance_job_attempts(started_at DESC);
      CREATE INDEX idx_maintenance_job_attempts_job_time
        ON maintenance_job_attempts(job_name, started_at DESC);

      CREATE TABLE diagnostic_errors (
        trace_id TEXT PRIMARY KEY,
        occurred_at INTEGER NOT NULL,
        error_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        resolved_at INTEGER
      );

      CREATE INDEX idx_diagnostic_errors_time
        ON diagnostic_errors(occurred_at DESC);
      CREATE INDEX idx_diagnostic_errors_active
        ON diagnostic_errors(active, occurred_at DESC);

      CREATE TABLE recovery_events (
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

      CREATE INDEX idx_recovery_events_time
        ON recovery_events(occurred_at DESC);
    `,
  },
  {
    version: 7,
    name: "player-private-market-data",
    sql: `
      CREATE TABLE player_holdings_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL,
        source TEXT NOT NULL CHECK (
          source IN ('manual', 'csv-import', 'json-import', 'alt1-confirmed')
        ),
        cash_gp INTEGER CHECK (cash_gp IS NULL OR cash_gp >= 0),
        snapshot_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1)
      );

      CREATE INDEX idx_player_holdings_profile_time
        ON player_holdings_snapshots(profile_id, captured_at DESC);

      CREATE TABLE ge_trade_records (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL CHECK (item_id > 0),
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        occurred_at TEXT NOT NULL,
        trade_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1)
      );

      CREATE INDEX idx_ge_trades_profile_time
        ON ge_trade_records(profile_id, occurred_at DESC);
      CREATE INDEX idx_ge_trades_profile_item_time
        ON ge_trade_records(profile_id, item_id, occurred_at DESC);

      CREATE TABLE player_market_preferences (
        profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
        preferences_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE market_watchlists (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        watchlist_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_market_watchlists_profile_name
        ON market_watchlists(profile_id, name COLLATE NOCASE);

      CREATE TABLE selected_player_profile (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        selected_at TEXT NOT NULL
      );
    `,
  },
];

export function pendingDatabaseMigrations(
  database: DatabaseConnection,
  migrations: readonly DatabaseMigration[] = DATABASE_MIGRATIONS,
  targetVersion = migrations.at(-1)?.version ?? 0,
): DatabaseMigration[] {
  const currentVersion = getDatabaseSchemaVersion(database);
  if (!Number.isSafeInteger(targetVersion) || targetVersion < currentVersion) {
    throw new Error(
      `Database migration target ${targetVersion} cannot be lower than current version ${currentVersion}`,
    );
  }
  const ordered = [...migrations].sort((left, right) => left.version - right.version);
  const versions = new Set<number>();
  for (const migration of ordered) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new Error("Database migration versions must be positive safe integers");
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate database migration version ${migration.version}`);
    }
    versions.add(migration.version);
  }
  const pending = ordered.filter(
    (migration) => migration.version > currentVersion && migration.version <= targetVersion,
  );
  let expected = currentVersion + 1;
  for (const migration of pending) {
    if (migration.version !== expected) {
      throw new Error(`Missing database migration version ${expected} before ${migration.version}`);
    }
    expected += 1;
  }
  if (targetVersion >= expected) {
    throw new Error(`Missing database migration version ${expected}`);
  }
  return pending;
}

export function applyDatabaseMigrations(
  database: DatabaseConnection,
  migrations: readonly DatabaseMigration[] = DATABASE_MIGRATIONS,
  targetVersion = migrations.at(-1)?.version ?? 0,
): number[] {
  const applied: number[] = [];
  for (const migration of pendingDatabaseMigrations(database, migrations, targetVersion)) {
    database.transaction(() => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${migration.version}`);
    })();
    applied.push(migration.version);
  }
  return applied;
}

export type OpenDatabaseOptions = {
  busyTimeoutMs?: number;
  targetVersion?: number;
  migrations?: readonly DatabaseMigration[];
};

export function openDatabase(
  filename: string,
  options: OpenDatabaseOptions = {},
): DatabaseConnection {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  const busyTimeoutMs = options.busyTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
    database.close();
    throw new Error("SQLite busy timeout must be between 0 and 60000 milliseconds");
  }
  database.pragma(`busy_timeout = ${busyTimeoutMs}`);
  if (filename !== ":memory:") {
    database.pragma("journal_mode = WAL");
  }
  const migrations = options.migrations ?? DATABASE_MIGRATIONS;
  try {
    applyDatabaseMigrations(
      database,
      migrations,
      options.targetVersion ?? migrations.at(-1)?.version ?? 0,
    );
  } catch (error) {
    database.close();
    throw error;
  }
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
