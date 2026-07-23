import type { PlayerStatsProvider, PriceProvider, TrainingMethodProvider } from "@gielinor/core";
import { LevellingPlannerService, ProfileService } from "@gielinor/core";
import {
  openDatabase,
  SqlitePlayerProfileRepository,
  SqliteTrainingMethodRepository,
} from "@gielinor/database";
import {
  PlayerProfileSchema,
  TrainingDataSnapshotSchema,
  TrainingMethodSchema,
} from "@gielinor/shared-types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService } from "../src/tool-service.js";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const CHECKED_AT = "2026-07-23T12:00:00.000Z";
const databases: ReturnType<typeof openDatabase>[] = [];
const servers: ReturnType<typeof createCompanionServer>[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const database of databases.splice(0)) {
    database.close();
  }
});

function method(id: string, minimumLevel: number, maximumLevel: number | undefined, rate: number) {
  return TrainingMethodSchema.parse({
    id,
    name: id,
    skillId: "mining",
    minimumLevel,
    ...(maximumLevel === undefined ? {} : { maximumLevel }),
    xpPerHour: rate,
    xpPerHourRange: { minimum: rate, maximum: rate },
    gpPerXp: 1,
    intensity: "medium",
    afkRating: "low",
    members: true,
    ironmanCompatibility: "supported",
    requirements: [],
    questRequirements: [],
    itemRequirements: [],
    equipment: [],
    notes: [],
    confidence: "high",
    uncertaintyNotes: [],
    sourceName: "fixture",
    sourceUrl: "https://example.test/training",
    sourceRevision: "1",
    sourceUpdatedAt: CHECKED_AT,
    lastCheckedAt: CHECKED_AT,
    contentHash: id === "copper" ? "a".repeat(64) : "b".repeat(64),
  });
}

describe("levelling planner end-to-end MCP flow", () => {
  it("refreshes methods and returns a validated multi-stage plan", async () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const profileRepository = new SqlitePlayerProfileRepository(database);
    await profileRepository.create(
      PlayerProfileSchema.parse({
        id: PROFILE_ID,
        displayName: "Planner",
        gameMode: "normal",
        availableGp: 10_000,
        availableHoursPerDay: 2,
        skills: [{ skillId: "mining", level: 1, experience: 0 }],
        completedQuestIds: [],
        inProgressQuestIds: [],
        goals: [],
      }),
    );
    const provider: TrainingMethodProvider = {
      fetchSnapshot: async () =>
        TrainingDataSnapshotSchema.parse({
          provider: "fixture",
          sourceUrl: "https://example.test/training",
          sourceRevision: "snapshot-1",
          retrievedAt: CHECKED_AT,
          methods: [method("copper", 1, 10, 1_000), method("iron", 10, undefined, 2_000)],
        }),
    };
    const profiles = new ProfileService(profileRepository, {} as PlayerStatsProvider);
    const planner = new LevellingPlannerService(
      new SqliteTrainingMethodRepository(database),
      profiles,
      undefined,
      provider,
      () => new Date(CHECKED_AT),
    );
    const server = createCompanionServer(
      new CompanionToolService(profiles, {} as PriceProvider, undefined, planner),
    );
    const client = new Client({ name: "levelling-e2e", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const refreshed = await client.callTool({
      name: "refresh_training_data",
      arguments: {},
    });
    expect(refreshed.structuredContent).toMatchObject({
      data: { total: 2, inserted: 2, updated: 0 },
    });

    const planned = await client.callTool({
      name: "create_levelling_plan",
      arguments: {
        profileId: PROFILE_ID,
        skillId: "mining",
        targetLevel: 20,
        strategy: "fastest",
      },
    });
    expect(planned.isError).not.toBe(true);
    expect(planned.structuredContent).toMatchObject({
      data: {
        skillId: "mining",
        targetLevel: 20,
        experienceRequired: 4_470,
        stages: [{ method: { id: "copper" } }, { method: { id: "iron" } }],
        totalGpRange: { minimum: 4_470, maximum: 4_470 },
        feasible: true,
      },
    });
  });
});
