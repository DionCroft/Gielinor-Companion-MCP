import { CompanionError } from "@gielinor/core";
import type { DatabaseConnection } from "@gielinor/database";
import { z } from "zod";

const OfflineStateSchema = z.object({ offline: z.boolean() }).strict();
const STATE_KEY = "runtime-offline-mode";

export class OfflineModeController {
  private offline: boolean;

  public constructor(
    private readonly database: DatabaseConnection,
    configuredDefault = false,
  ) {
    const row = database
      .prepare("SELECT value_json FROM system_state WHERE state_key = ?")
      .get(STATE_KEY) as { value_json: string } | undefined;
    if (row === undefined) {
      this.offline = configuredDefault;
      return;
    }
    try {
      this.offline = OfflineStateSchema.parse(JSON.parse(row.value_json)).offline;
    } catch (error) {
      throw new CompanionError("Stored offline-mode state is invalid", "INVALID_STORED_DATA", {
        cause: error,
      });
    }
  }

  public isOffline(): boolean {
    return this.offline;
  }

  public setOffline(offline: boolean): { offline: boolean; enforcedBy: "backend" } {
    const parsed = z.boolean().parse(offline);
    const updatedAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO system_state (state_key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(state_key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .run(STATE_KEY, JSON.stringify({ offline: parsed }), updatedAt);
    this.offline = parsed;
    return { offline: parsed, enforcedBy: "backend" };
  }
}
