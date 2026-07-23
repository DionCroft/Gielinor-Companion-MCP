import type {
  PlayerProfileRepository,
  PlayerStatsProvider,
  QuestRepository,
} from "../src/ports.js";
import { ProfileService } from "../src/profile-service.js";
import { QuestService } from "../src/quest-service.js";
import {
  PlayerProfileSchema,
  QuestDataStatusSchema,
  QuestSchema,
  type PlayerProfile,
  type Quest,
  type QuestDataStatus,
  type QuestSyncResult,
} from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const CHECKED_AT = "2026-07-23T12:00:00.000Z";

function quest(
  id: string,
  options: {
    prerequisites?: Quest["prerequisiteGroups"];
    skills?: Quest["skillRequirements"];
    items?: Quest["itemRequirements"];
    otherRequirements?: string[];
    questPointReward?: number;
    questPointRequirement?: number;
  } = {},
): Quest {
  const prerequisites = options.prerequisites ?? [];
  return QuestSchema.parse({
    id,
    name: id
      .split("-")
      .map((part) => `${part[0]?.toLocaleUpperCase()}${part.slice(1)}`)
      .join(" "),
    aliases: [],
    members: true,
    ...(options.questPointReward === undefined
      ? {}
      : { questPointReward: options.questPointReward }),
    ...(options.questPointRequirement === undefined
      ? {}
      : { questPointRequirement: options.questPointRequirement }),
    prerequisiteQuestIds: prerequisites.flatMap((group) =>
      group.quests.map((requirement) => requirement.questId),
    ),
    prerequisiteGroups: prerequisites,
    skillRequirements: options.skills ?? [],
    otherRequirements: options.otherRequirements ?? [],
    itemRequirements: options.items ?? [],
    recommendedItems: [],
    rewards: [],
    guideUrl: `https://example.test/wiki/${id}`,
    sourcePageUrl: `https://example.test/wiki/${id}`,
    sourceName: "fixture",
    sourceRevision: "1",
    sourceUpdatedAt: CHECKED_AT,
    contentHash: "a".repeat(64),
    lastCheckedAt: CHECKED_AT,
  });
}

class MemoryProfileRepository implements PlayerProfileRepository {
  public constructor(private profile: PlayerProfile) {}

  public async create(profile: PlayerProfile): Promise<PlayerProfile> {
    this.profile = profile;
    return profile;
  }

  public async getById(id: string): Promise<PlayerProfile | null> {
    return id === this.profile.id ? this.profile : null;
  }

  public async list(): Promise<PlayerProfile[]> {
    return [this.profile];
  }

  public async save(profile: PlayerProfile): Promise<PlayerProfile> {
    this.profile = profile;
    return profile;
  }
}

class MemoryQuestRepository implements QuestRepository {
  private readonly byId: Map<string, Quest>;

  public constructor(quests: Quest[]) {
    this.byId = new Map(quests.map((entry) => [entry.id, entry]));
  }

  public async getByIdOrAlias(identifier: string): Promise<Quest | null> {
    const normalized = identifier.toLocaleLowerCase();
    return (
      [...this.byId.values()].find(
        (entry) =>
          entry.id.toLocaleLowerCase() === normalized ||
          entry.name.toLocaleLowerCase() === normalized ||
          entry.aliases.some((alias) => alias.toLocaleLowerCase() === normalized),
      ) ?? null
    );
  }

  public async list(): Promise<Quest[]> {
    return [...this.byId.values()];
  }

  public async search(query: string, limit: number): Promise<Quest[]> {
    const normalized = query.toLocaleLowerCase();
    return [...this.byId.values()]
      .filter(
        (entry) =>
          entry.name.toLocaleLowerCase().includes(normalized) ||
          entry.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalized)),
      )
      .slice(0, limit);
  }

  public async replaceSnapshot(): Promise<QuestSyncResult> {
    throw new Error("not used");
  }

  public async getDataStatus(): Promise<QuestDataStatus> {
    return QuestDataStatusSchema.parse({ state: "ready", questCount: this.byId.size });
  }

  public async recordSyncFailure(): Promise<void> {}
}

function harness(
  quests: Quest[],
  profileOptions: {
    completed?: string[];
    inProgress?: string[];
    skills?: PlayerProfile["skills"];
  } = {},
): { service: QuestService; profiles: ProfileService } {
  const profile = PlayerProfileSchema.parse({
    id: PROFILE_ID,
    displayName: "Rune Tester",
    gameMode: "normal",
    skills: profileOptions.skills ?? [],
    completedQuestIds: profileOptions.completed ?? [],
    inProgressQuestIds: profileOptions.inProgress ?? [],
    goals: [],
  });
  const profiles = new ProfileService(
    new MemoryProfileRepository(profile),
    {} as PlayerStatsProvider,
  );
  return {
    profiles,
    service: new QuestService(new MemoryQuestRepository(quests), profiles),
  };
}

describe("QuestService prerequisite planning", () => {
  it("orders deep prerequisite chains before the target", async () => {
    const first = quest("first");
    const second = quest("second", {
      prerequisites: [{ mode: "all", quests: [{ questId: "first", requiredStatus: "completed" }] }],
    });
    const target = quest("target", {
      prerequisites: [
        { mode: "all", quests: [{ questId: "second", requiredStatus: "completed" }] },
      ],
    });
    const { service } = harness([target, second, first]);

    const route = await service.createRoute(PROFILE_ID, "target");
    expect(route.steps.map((step) => step.questId)).toEqual(["first", "second", "target"]);
  });

  it("detects circular prerequisites without recursing indefinitely", async () => {
    const left = quest("left", {
      prerequisites: [{ mode: "all", quests: [{ questId: "right", requiredStatus: "completed" }] }],
    });
    const right = quest("right", {
      prerequisites: [{ mode: "all", quests: [{ questId: "left", requiredStatus: "completed" }] }],
    });
    const { service } = harness([left, right]);

    await expect(service.createRoute(PROFILE_ID, "left")).rejects.toMatchObject({
      code: "QUEST_PREREQUISITE_CYCLE",
    });
  });

  it("selects the shortest unsatisfied alternative and reports every option", async () => {
    const longStart = quest("long-start");
    const longFinish = quest("long-finish", {
      prerequisites: [
        { mode: "all", quests: [{ questId: "long-start", requiredStatus: "completed" }] },
      ],
    });
    const short = quest("short");
    const target = quest("target", {
      prerequisites: [
        {
          mode: "any",
          quests: [
            { questId: "long-finish", requiredStatus: "completed" },
            { questId: "short", requiredStatus: "completed" },
          ],
        },
      ],
    });
    const { service } = harness([target, longFinish, longStart, short]);

    const route = await service.createRoute(PROFILE_ID, "target");
    expect(route.steps.map((step) => step.questId)).toEqual(["short", "target"]);
    expect(route.alternatives).toEqual([
      {
        groupQuestId: "target",
        selectedQuestId: "short",
        alternativeQuestIds: ["long-finish", "short"],
      },
    ]);
  });
});

describe("QuestService profile-aware requirements", () => {
  it("filters available quests using completed quests and skill levels", async () => {
    const prerequisite = quest("prerequisite", { questPointReward: 2 });
    const available = quest("available", {
      prerequisites: [
        {
          mode: "all",
          quests: [{ questId: "prerequisite", requiredStatus: "completed" }],
        },
      ],
      skills: [{ skillId: "mining", level: 50 }],
      questPointReward: 2,
      questPointRequirement: 2,
    });
    const blocked = quest("blocked", {
      skills: [{ skillId: "crafting", level: 90 }],
    });
    const { service } = harness([prerequisite, available, blocked], {
      completed: ["prerequisite"],
      skills: [
        { skillId: "mining", level: 60, experience: 300_000 },
        { skillId: "crafting", level: 10, experience: 1_000 },
      ],
    });

    const result = await service.listAvailable(PROFILE_ID);
    expect(result.map((entry) => entry.quest.id)).toEqual(["available"]);
    expect(result[0]?.recommendationReasons).toContain("2 quest point reward");
  });

  it("reports missing quest, skill, and manual requirements across the route", async () => {
    const prerequisite = quest("prerequisite", {
      skills: [{ skillId: "crafting", level: 30 }],
      otherRequirements: ["Bring a light source"],
    });
    const target = quest("target", {
      prerequisites: [
        {
          mode: "all",
          quests: [{ questId: "prerequisite", requiredStatus: "completed" }],
        },
      ],
      skills: [{ skillId: "crafting", level: 50 }],
    });
    const { service } = harness([prerequisite, target], {
      skills: [{ skillId: "crafting", level: 20, experience: 4_000 }],
    });

    const result = await service.listMissingRequirements(PROFILE_ID, "target");
    expect(result.quests.map((entry) => entry.questId)).toEqual(["prerequisite"]);
    expect(result.skills).toEqual([
      {
        skillId: "crafting",
        currentLevel: 20,
        requiredLevel: 50,
        requiredByQuestIds: ["prerequisite", "target"],
      },
    ]);
    expect(result.manualRequirements).toEqual(["Prerequisite: Bring a light source"]);
  });

  it("persists bulk manual statuses without duplicate completed/in-progress entries", async () => {
    const { service, profiles } = harness([quest("one"), quest("two")]);
    await service.setMultipleStatuses(PROFILE_ID, [
      { questId: "one", status: "completed" },
      { questId: "two", status: "in-progress" },
      { questId: "one", status: "not-started" },
    ]);

    const profile = await profiles.get(PROFILE_ID);
    expect(profile.completedQuestIds).toEqual([]);
    expect(profile.inProgressQuestIds).toEqual(["two"]);
  });

  it("aggregates duplicate shopping-list items across route quests", async () => {
    const prerequisite = quest("prerequisite", {
      items: [{ name: "Rune bar", quantity: 2 }],
    });
    const target = quest("target", {
      prerequisites: [
        {
          mode: "all",
          quests: [{ questId: "prerequisite", requiredStatus: "completed" }],
        },
      ],
      items: [
        { name: "rune bar", quantity: 3, alternatives: ["Adamant bar"] },
        { name: "Magic logs", quantity: 10 },
      ],
    });
    const { service } = harness([prerequisite, target]);

    const result = await service.createShoppingList(PROFILE_ID, "target");
    expect(result.items).toEqual([
      {
        name: "Magic logs",
        quantity: 10,
        alternatives: [],
        requiredByQuestIds: ["target"],
      },
      {
        name: "Rune bar",
        quantity: 5,
        alternatives: ["Adamant bar"],
        requiredByQuestIds: ["prerequisite", "target"],
      },
    ]);
  });
});
