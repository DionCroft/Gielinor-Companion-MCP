import { randomUUID } from "node:crypto";

import { PlayerPrivateDataService } from "@gielinor/core";
import { PlayerProfileSchema } from "@gielinor/shared-types";
import { afterEach, describe, expect, it } from "vitest";

import { DATABASE_SCHEMA_VERSION, getDatabaseSchemaVersion, openDatabase } from "../src/connection.js";
import { SqlitePlayerPrivateDataRepository } from "../src/private-data-repository.js";
import { SqlitePlayerProfileRepository } from "../src/repositories.js";

const databases: ReturnType<typeof openDatabase>[] = [];

function setup() {
  const database = openDatabase(":memory:");
  databases.push(database);
  const profiles = new SqlitePlayerProfileRepository(database);
  const privateData = new PlayerPrivateDataService(
    new SqlitePlayerPrivateDataRepository(database),
    profiles,
  );
  return { database, profiles, privateData };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("player-private market data", () => {
  it("migrates additively and persists versioned holdings snapshots", async () => {
    const { database, profiles, privateData } = setup();
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: "Local Hero",
      gameMode: "normal",
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    });
    await profiles.create(profile);

    expect(getDatabaseSchemaVersion(database)).toBe(DATABASE_SCHEMA_VERSION);
    expect(await privateData.getHoldings(profile.id)).toBeNull();
    await expect(
      privateData.replaceHoldings({
        profileId: profile.id,
        items: [{ itemId: 4151, quantity: 2 }],
        confirmReplace: false,
      }),
    ).rejects.toThrow(/confirmReplace=true/);

    const first = await privateData.replaceHoldings({
      profileId: profile.id,
      cashGp: 2_000_000,
      items: [
        { itemId: 4151, quantity: 2, averageAcquisitionPrice: 80_000 },
        { itemId: 453, quantity: 100 },
      ],
      confirmReplace: true,
    });
    expect(first).toMatchObject({ schemaVersion: 1, source: "manual", cashGp: 2_000_000 });

    const second = await privateData.upsertHolding({
      profileId: profile.id,
      holding: { itemId: 4151, quantity: 3, averageAcquisitionPrice: 81_000 },
    });
    expect(second.items.find((item) => item.itemId === 4151)?.quantity).toBe(3);
    expect(second.cashGp).toBe(2_000_000);
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS count FROM player_holdings_snapshots")
          .get() as { count: number }
      ).count,
    ).toBe(2);
  });

  it("imports and exports bounded CSV and JSON without inventing values", async () => {
    const { profiles, privateData } = setup();
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: "CSV Hero",
      gameMode: "normal",
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    });
    await profiles.create(profile);

    const imported = await privateData.importHoldings({
      profileId: profile.id,
      format: "csv",
      content:
        'itemId,quantity,averageAcquisitionPrice,notes\n4151,2,80000,"manual, confirmed"\n453,50,,\n',
      confirmReplace: true,
    });
    expect(imported.source).toBe("csv-import");
    expect(imported.items.find((item) => item.itemId === 4151)?.notes).toBe(
      "manual, confirmed",
    );

    const csv = await privateData.exportHoldings(profile.id, "csv");
    expect(csv.content).toContain('4151,2,80000,"manual, confirmed"');
    const json = await privateData.exportHoldings(profile.id, "json");
    expect(JSON.parse(json.content)).toMatchObject({ profileId: profile.id, source: "csv-import" });
  });

  it("persists the trade journal, preferences, watchlists and selected player", async () => {
    const { profiles, privateData } = setup();
    const profile = PlayerProfileSchema.parse({
      id: randomUUID(),
      displayName: "Trade Hero",
      gameMode: "normal",
      skills: [],
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    });
    await profiles.create(profile);

    const trade = await privateData.recordTrade({
      profileId: profile.id,
      itemId: 4151,
      side: "buy",
      quantity: 2,
      unitPrice: 80_000,
      occurredAt: "2026-08-02T12:00:00.000Z",
      source: "manual",
    });
    const updatedTrade = await privateData.updateTrade(profile.id, trade.id, { unitPrice: 81_000 });
    expect(updatedTrade.unitPrice).toBe(81_000);
    expect(await privateData.listTrades(profile.id)).toHaveLength(1);

    expect(await privateData.getMarketPreferences(profile.id)).toMatchObject({
      strategy: "balanced",
      minimumDataConfidence: 60,
    });
    await expect(
      privateData.updateMarketPreferences(profile.id, { maximumAllocationPercent: 120 }),
    ).rejects.toThrow();
    expect(
      await privateData.updateMarketPreferences(profile.id, {
        strategy: "trend",
        maximumAllocationPercent: 8,
      }),
    ).toMatchObject({ strategy: "trend", maximumAllocationPercent: 8 });

    const watchlist = await privateData.createWatchlist({
      profileId: profile.id,
      name: "Daily review",
      itemIds: [4151],
    });
    expect(
      await privateData.updateWatchlist(profile.id, watchlist.id, { itemIds: [4151, 453] }),
    ).toMatchObject({ itemIds: [4151, 453] });

    await privateData.setSelectedProfile(profile.id);
    expect(await privateData.getSelectedPlayerSnapshot()).toMatchObject({
      profile: { id: profile.id },
      holdings: null,
      marketPreferences: { strategy: "trend" },
    });

    await expect(privateData.removeTrade(profile.id, trade.id)).resolves.toEqual({ removed: true });
    expect(await privateData.listTrades(profile.id)).toEqual([]);
  });
});
