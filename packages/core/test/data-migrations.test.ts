import { z } from "zod";
import { describe, expect, it } from "vitest";

import { VersionedDataMigrator, migrateProfileExport } from "../src/data-migrations.js";

describe("versioned data migrations", () => {
  it("migrates legacy profile exports to the current schema", () => {
    expect(
      migrateProfileExport({
        schemaVersion: 0,
        displayName: "Legacy",
        completedQuestIds: ["cooks-assistant"],
      }),
    ).toEqual({
      schemaVersion: 1,
      displayName: "Legacy",
      gameMode: "normal",
      completedQuestIds: ["cooks-assistant"],
      inProgressQuestIds: [],
      goals: [],
    });
  });

  it("does not mutate input when a migration fails", () => {
    const target = z
      .object({
        schemaVersion: z.literal(2),
        value: z.string(),
      })
      .strict();
    const input = { schemaVersion: 0, value: "original" };
    const migrator = new VersionedDataMigrator(2, target, [
      {
        fromVersion: 0,
        toVersion: 1,
        name: "first",
        migrate: (value) => ({ ...(value as object), schemaVersion: 1, value: "changed" }),
      },
      {
        fromVersion: 1,
        toVersion: 2,
        name: "injected-failure",
        migrate: () => {
          throw new Error("failure injection");
        },
      },
    ]);

    expect(() => migrator.migrate(input)).toThrowError(
      expect.objectContaining({ code: "DATA_MIGRATION_FAILED" }),
    );
    expect(input).toEqual({ schemaVersion: 0, value: "original" });
  });

  it("rejects data from a newer unsupported schema", () => {
    expect(() => migrateProfileExport({ schemaVersion: 99 })).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_DATA_VERSION" }),
    );
  });
});
