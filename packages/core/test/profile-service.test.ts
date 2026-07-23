import {
  ProfileExportSchema,
  type PlayerProfile,
  type PlayerStatsResult,
} from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import type { PlayerProfileRepository, PlayerStatsProvider } from "../src/ports.js";
import { ProfileService } from "../src/profile-service.js";

class MemoryProfiles implements PlayerProfileRepository {
  public readonly profiles = new Map<string, PlayerProfile>();

  public async create(profile: PlayerProfile): Promise<PlayerProfile> {
    this.profiles.set(profile.id, profile);
    return profile;
  }

  public async getById(id: string): Promise<PlayerProfile | null> {
    return this.profiles.get(id) ?? null;
  }

  public async list(): Promise<PlayerProfile[]> {
    return [...this.profiles.values()];
  }

  public async save(profile: PlayerProfile): Promise<PlayerProfile> {
    this.profiles.set(profile.id, profile);
    return profile;
  }
}

const unusedStatsProvider: PlayerStatsProvider = {
  getPlayerStats(): Promise<PlayerStatsResult> {
    throw new Error("Not used by this test");
  },
};

describe("ProfileService import and export", () => {
  it("round-trips the stable profile format and creates goal IDs locally", async () => {
    const repository = new MemoryProfiles();
    const service = new ProfileService(repository, unusedStatsProvider);
    const portable = ProfileExportSchema.parse({
      schemaVersion: 1,
      displayName: "Rune Tester",
      gameMode: "normal",
      availableGp: 50_000_000,
      completedQuestIds: ["cooks-assistant"],
      inProgressQuestIds: [],
      goals: [{ type: "quest", targetId: "plagues-end" }],
    });

    const imported = await service.import(portable);
    expect(imported.goals[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await service.export(imported.id)).toEqual(portable);
  });

  it("rejects unknown fields in imported profiles", async () => {
    const service = new ProfileService(new MemoryProfiles(), unusedStatsProvider);
    await expect(
      service.import({
        schemaVersion: 1,
        displayName: "Rune Tester",
        gameMode: "normal",
        completedQuestIds: [],
        inProgressQuestIds: [],
        goals: [],
        password: "must-not-be-accepted",
      }),
    ).rejects.toThrow();
  });
});
