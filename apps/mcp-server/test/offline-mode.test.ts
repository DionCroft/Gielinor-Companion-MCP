import { openDatabase } from "@gielinor/database";
import { describe, expect, it } from "vitest";

import { OfflineModeController } from "../src/offline-mode.js";

describe("backend-enforced offline mode", () => {
  it("persists across runtime controller instances", () => {
    const database = openDatabase(":memory:");
    const first = new OfflineModeController(database, false);
    expect(first.isOffline()).toBe(false);
    expect(first.setOffline(true)).toEqual({ offline: true, enforcedBy: "backend" });
    expect(new OfflineModeController(database, false).isOffline()).toBe(true);
    expect(new OfflineModeController(database, true).setOffline(false)).toEqual({
      offline: false,
      enforcedBy: "backend",
    });
    expect(new OfflineModeController(database, true).isOffline()).toBe(false);
    database.close();
  });
});
