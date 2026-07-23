import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export type HostedAccount = {
  id: string;
  createdAt: string;
};

export type CreatedHostedAccount = HostedAccount & {
  accessToken: string;
};

type AccountRow = {
  id: string;
  created_at: string;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class HostedAccountStore {
  private readonly database: Database.Database;

  public constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.database = new Database(filename);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS hosted_accounts (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('active', 'deleting')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hosted_accounts_token_hash
        ON hosted_accounts(token_hash);
    `);
  }

  public create(): CreatedHostedAccount {
    const id = randomUUID();
    const accessToken = `gcmcp_${randomBytes(32).toString("base64url")}`;
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO hosted_accounts (id, token_hash, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
      )
      .run(id, tokenHash(accessToken), createdAt, createdAt);
    return { id, accessToken, createdAt };
  }

  public authenticate(accessToken: string): HostedAccount | null {
    if (accessToken.length < 32 || accessToken.length > 256 || !accessToken.startsWith("gcmcp_")) {
      return null;
    }
    const row = this.database
      .prepare(
        `SELECT id, created_at
         FROM hosted_accounts
         WHERE token_hash = ? AND status = 'active'`,
      )
      .get(tokenHash(accessToken)) as AccountRow | undefined;
    return row === undefined ? null : { id: row.id, createdAt: row.created_at };
  }

  public beginDeletion(id: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE hosted_accounts
         SET status = 'deleting', updated_at = ?
         WHERE id = ? AND status = 'active'`,
      )
      .run(new Date().toISOString(), id);
    return result.changes === 1;
  }

  public finishDeletion(id: string): void {
    this.database.prepare("DELETE FROM hosted_accounts WHERE id = ?").run(id);
  }

  public restoreAfterFailedDeletion(id: string): void {
    this.database
      .prepare(
        `UPDATE hosted_accounts
         SET status = 'active', updated_at = ?
         WHERE id = ? AND status = 'deleting'`,
      )
      .run(new Date().toISOString(), id);
  }

  public ready(): boolean {
    const result = this.database.prepare("SELECT 1 AS ready").get() as { ready: number };
    return result.ready === 1;
  }

  public close(): void {
    this.database.close();
  }
}
