import type { PlayerPrivateDataRepository } from "@gielinor/core";
import {
  GeTradeRecordSchema,
  MarketPreferencesSchema,
  MarketWatchlistSchema,
  PlayerHoldingsSnapshotSchema,
  PaperPortfolioSchema,
  type GeTradeRecord,
  type MarketPreferences,
  type MarketWatchlist,
  type PlayerHoldingsSnapshot,
  type PaperPortfolio,
} from "@gielinor/shared-types";

import type { DatabaseConnection } from "./connection.js";

function parseStored<T>(value: string, parse: (input: unknown) => T): T {
  return parse(JSON.parse(value) as unknown);
}

export class SqlitePlayerPrivateDataRepository implements PlayerPrivateDataRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public async getLatestHoldings(profileId: string): Promise<PlayerHoldingsSnapshot | null> {
    const row = this.database
      .prepare(
        `SELECT snapshot_json
         FROM player_holdings_snapshots
         WHERE profile_id = ?
         ORDER BY captured_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(profileId) as { snapshot_json: string } | undefined;
    return row === undefined
      ? null
      : parseStored(row.snapshot_json, (value) => PlayerHoldingsSnapshotSchema.parse(value));
  }

  public async saveHoldings(snapshot: PlayerHoldingsSnapshot): Promise<PlayerHoldingsSnapshot> {
    const parsed = PlayerHoldingsSnapshotSchema.parse(snapshot);
    this.database
      .prepare(
        `INSERT INTO player_holdings_snapshots (
           snapshot_id, profile_id, captured_at, source, cash_gp, snapshot_json, schema_version
         ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        parsed.snapshotId,
        parsed.profileId,
        parsed.capturedAt,
        parsed.source,
        parsed.cashGp ?? null,
        JSON.stringify(parsed),
      );
    return parsed;
  }

  public async getTrade(profileId: string, tradeId: string): Promise<GeTradeRecord | null> {
    const row = this.database
      .prepare("SELECT trade_json FROM ge_trade_records WHERE profile_id = ? AND id = ?")
      .get(profileId, tradeId) as { trade_json: string } | undefined;
    return row === undefined
      ? null
      : parseStored(row.trade_json, (value) => GeTradeRecordSchema.parse(value));
  }

  public async listTrades(profileId: string): Promise<GeTradeRecord[]> {
    const rows = this.database
      .prepare(
        `SELECT trade_json
         FROM ge_trade_records
         WHERE profile_id = ?
         ORDER BY occurred_at DESC, rowid DESC`,
      )
      .all(profileId) as Array<{ trade_json: string }>;
    return rows.map((row) =>
      parseStored(row.trade_json, (value) => GeTradeRecordSchema.parse(value)),
    );
  }

  public async saveTrade(record: GeTradeRecord): Promise<GeTradeRecord> {
    const parsed = GeTradeRecordSchema.parse(record);
    this.database
      .prepare(
        `INSERT INTO ge_trade_records (
           id, profile_id, item_id, side, occurred_at, trade_json, schema_version
         ) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           item_id = excluded.item_id,
           side = excluded.side,
           occurred_at = excluded.occurred_at,
           trade_json = excluded.trade_json`,
      )
      .run(
        parsed.id,
        parsed.profileId,
        parsed.itemId,
        parsed.side,
        parsed.occurredAt,
        JSON.stringify(parsed),
      );
    return parsed;
  }

  public async removeTrade(profileId: string, tradeId: string): Promise<boolean> {
    const result = this.database
      .prepare("DELETE FROM ge_trade_records WHERE profile_id = ? AND id = ?")
      .run(profileId, tradeId);
    return result.changes === 1;
  }

  public async getMarketPreferences(profileId: string): Promise<MarketPreferences | null> {
    const row = this.database
      .prepare("SELECT preferences_json FROM player_market_preferences WHERE profile_id = ?")
      .get(profileId) as { preferences_json: string } | undefined;
    return row === undefined
      ? null
      : parseStored(row.preferences_json, (value) => MarketPreferencesSchema.parse(value));
  }

  public async saveMarketPreferences(
    profileId: string,
    preferences: MarketPreferences,
    updatedAt: string,
  ): Promise<MarketPreferences> {
    const parsed = MarketPreferencesSchema.parse(preferences);
    this.database
      .prepare(
        `INSERT INTO player_market_preferences (
           profile_id, preferences_json, schema_version, updated_at
         ) VALUES (?, ?, 1, ?)
         ON CONFLICT(profile_id) DO UPDATE SET
           preferences_json = excluded.preferences_json,
           updated_at = excluded.updated_at`,
      )
      .run(profileId, JSON.stringify(parsed), updatedAt);
    return parsed;
  }

  public async getWatchlist(
    profileId: string,
    watchlistId: string,
  ): Promise<MarketWatchlist | null> {
    const row = this.database
      .prepare("SELECT watchlist_json FROM market_watchlists WHERE profile_id = ? AND id = ?")
      .get(profileId, watchlistId) as { watchlist_json: string } | undefined;
    return row === undefined
      ? null
      : parseStored(row.watchlist_json, (value) => MarketWatchlistSchema.parse(value));
  }

  public async listWatchlists(profileId: string): Promise<MarketWatchlist[]> {
    const rows = this.database
      .prepare(
        `SELECT watchlist_json
         FROM market_watchlists
         WHERE profile_id = ?
         ORDER BY name COLLATE NOCASE, created_at`,
      )
      .all(profileId) as Array<{ watchlist_json: string }>;
    return rows.map((row) =>
      parseStored(row.watchlist_json, (value) => MarketWatchlistSchema.parse(value)),
    );
  }

  public async saveWatchlist(watchlist: MarketWatchlist): Promise<MarketWatchlist> {
    const parsed = MarketWatchlistSchema.parse(watchlist);
    this.database
      .prepare(
        `INSERT INTO market_watchlists (
           id, profile_id, name, watchlist_json, schema_version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           watchlist_json = excluded.watchlist_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        parsed.id,
        parsed.profileId,
        parsed.name,
        JSON.stringify(parsed),
        parsed.createdAt,
        parsed.updatedAt,
      );
    return parsed;
  }

  public async getSelectedProfile(): Promise<{ profileId: string; selectedAt: string } | null> {
    const row = this.database
      .prepare("SELECT profile_id, selected_at FROM selected_player_profile WHERE singleton_id = 1")
      .get() as { profile_id: string; selected_at: string } | undefined;
    return row === undefined ? null : { profileId: row.profile_id, selectedAt: row.selected_at };
  }

  public async setSelectedProfile(profileId: string, selectedAt: string): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO selected_player_profile (singleton_id, profile_id, selected_at)
         VALUES (1, ?, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET
           profile_id = excluded.profile_id,
           selected_at = excluded.selected_at`,
      )
      .run(profileId, selectedAt);
  }

  public async getPaperPortfolio(profileId: string): Promise<PaperPortfolio | null> {
    const row = this.database
      .prepare("SELECT portfolio_json FROM paper_portfolios WHERE profile_id = ?")
      .get(profileId) as { portfolio_json: string } | undefined;
    return row === undefined
      ? null
      : parseStored(row.portfolio_json, (value) => PaperPortfolioSchema.parse(value));
  }

  public async savePaperPortfolio(portfolio: PaperPortfolio): Promise<PaperPortfolio> {
    const parsed = PaperPortfolioSchema.parse(portfolio);
    this.database
      .prepare(
        `INSERT INTO paper_portfolios (profile_id, portfolio_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(profile_id) DO UPDATE SET
           portfolio_json = excluded.portfolio_json,
           updated_at = excluded.updated_at`,
      )
      .run(parsed.profileId, JSON.stringify(parsed), parsed.updatedAt);
    return parsed;
  }
}
