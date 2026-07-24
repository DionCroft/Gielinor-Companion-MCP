import { randomUUID } from "node:crypto";

import { PlayerProfileSchema } from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../src/connection.js";
import { SqlitePlayerProfileRepository } from "../src/repositories.js";

describe("large profile performance and memory bounds", () => {
  it("stores and lists 2000 profiles within bounded time and heap growth", async () => {
    const database = openDatabase(":memory:");
    try {
      const repository = new SqlitePlayerProfileRepository(database);
      const heapBefore = process.memoryUsage().heapUsed;
      const startedAt = performance.now();
      for (let index = 0; index < 2_000; index += 1) {
        await repository.create(
          PlayerProfileSchema.parse({
            id: randomUUID(),
            displayName: `P${index.toString().padStart(6, "0")}`,
            gameMode: "normal",
            skills: [],
            completedQuestIds: [],
            inProgressQuestIds: [],
            goals: [],
          }),
        );
      }
      const profiles = await repository.list();
      const elapsedMs = performance.now() - startedAt;
      const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

      expect(profiles).toHaveLength(2_000);
      expect(elapsedMs).toBeLessThan(5_000);
      expect(heapGrowth).toBeLessThan(64 * 1024 * 1024);
    } finally {
      database.close();
    }
  });
});
