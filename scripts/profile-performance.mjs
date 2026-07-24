import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { openDatabase, SqlitePlayerProfileRepository } from "../packages/database/dist/index.js";
import { PlayerProfileSchema } from "../packages/shared-types/dist/index.js";

const profileCount = 5_000;
const database = openDatabase(":memory:");
const repository = new SqlitePlayerProfileRepository(database);
const heapBefore = process.memoryUsage().heapUsed;
const writeStartedAt = performance.now();

try {
  for (let index = 0; index < profileCount; index += 1) {
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
  const writeMs = performance.now() - writeStartedAt;
  const readStartedAt = performance.now();
  const profiles = await repository.list();
  const readMs = performance.now() - readStartedAt;
  const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const report = {
    profileCount: profiles.length,
    writeMs: Math.round(writeMs * 100) / 100,
    readMs: Math.round(readMs * 100) / 100,
    heapGrowthBytes,
    node: process.version,
    platform: process.platform,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    profiles.length !== profileCount ||
    writeMs > 10_000 ||
    readMs > 2_000 ||
    heapGrowthBytes > 128 * 1024 * 1024
  ) {
    process.exitCode = 1;
  }
} finally {
  database.close();
}
