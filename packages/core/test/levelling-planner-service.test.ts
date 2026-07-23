import {
  PlayerProfileSchema,
  TrainingDataStatusSchema,
  TrainingMethodSchema,
  type PlayerProfile,
  type SkillId,
  type TrainingDataSnapshot,
  type TrainingMethod,
  type TrainingSyncResult,
} from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { LevellingPlannerService } from "../src/levelling-planner-service.js";
import type {
  PlayerProfileRepository,
  PlayerStatsProvider,
  TrainingMethodRepository,
} from "../src/ports.js";
import { ProfileService } from "../src/profile-service.js";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const CHECKED_AT = "2026-07-23T12:00:00.000Z";

function method(
  id: string,
  options: {
    minimumLevel: number;
    maximumLevel?: number;
    xp?: { minimum: number; maximum: number };
    gpPerXp?: number;
    intensity?: "low" | "medium" | "high";
    afkRating?: "not-afk" | "low" | "moderate" | "high";
    ironmanCompatibility?: "supported" | "unsupported" | "unknown";
    questRequirements?: string[];
    skillId?: SkillId;
  },
): TrainingMethod {
  return TrainingMethodSchema.parse({
    id,
    name: id,
    skillId: options.skillId ?? "mining",
    minimumLevel: options.minimumLevel,
    ...(options.maximumLevel === undefined ? {} : { maximumLevel: options.maximumLevel }),
    ...(options.xp === undefined
      ? {}
      : { xpPerHour: options.xp.maximum, xpPerHourRange: options.xp }),
    ...(options.gpPerXp === undefined ? {} : { gpPerXp: options.gpPerXp }),
    intensity: options.intensity ?? "medium",
    afkRating: options.afkRating ?? "low",
    members: true,
    ironmanCompatibility: options.ironmanCompatibility ?? "supported",
    requirements: [],
    questRequirements: options.questRequirements ?? [],
    itemRequirements: [],
    equipment: [],
    notes: [],
    confidence: "high",
    uncertaintyNotes: ["Fixture rates vary."],
    sourceName: "fixture",
    sourceUrl: "https://example.test/training",
    sourceRevision: "1",
    sourceUpdatedAt: CHECKED_AT,
    lastCheckedAt: CHECKED_AT,
    contentHash: "a".repeat(64),
  });
}

class MemoryProfiles implements PlayerProfileRepository {
  public constructor(private profile: PlayerProfile) {}
  public async create(profile: PlayerProfile) {
    this.profile = profile;
    return profile;
  }
  public async getById(id: string) {
    return id === this.profile.id ? this.profile : null;
  }
  public async list() {
    return [this.profile];
  }
  public async save(profile: PlayerProfile) {
    this.profile = profile;
    return profile;
  }
}

class MemoryTraining implements TrainingMethodRepository {
  public constructor(private methods: TrainingMethod[]) {}
  public async getById(id: string) {
    return this.methods.find((entry) => entry.id === id) ?? null;
  }
  public async list(filters: { skillId?: SkillId; level?: number } = {}) {
    return this.methods.filter(
      (entry) =>
        (filters.skillId === undefined || entry.skillId === filters.skillId) &&
        (filters.level === undefined ||
          (entry.minimumLevel <= filters.level &&
            (entry.maximumLevel === undefined || entry.maximumLevel >= filters.level))),
    );
  }
  public async replaceSnapshot(snapshot: TrainingDataSnapshot): Promise<TrainingSyncResult> {
    this.methods = [...snapshot.methods];
    return {
      provider: snapshot.provider,
      sourceRevision: snapshot.sourceRevision,
      checkedAt: snapshot.retrievedAt,
      total: snapshot.methods.length,
      inserted: snapshot.methods.length,
      updated: 0,
      unchanged: 0,
      removed: 0,
    };
  }
  public async getDataStatus() {
    return TrainingDataStatusSchema.parse({
      state: "ready",
      methodCount: this.methods.length,
      coveredSkills: [...new Set(this.methods.map((entry) => entry.skillId))],
    });
  }
  public async recordSyncFailure() {}
}

function profile(
  options: {
    gameMode?: "normal" | "ironman";
    completedQuestIds?: string[];
    availableGp?: number;
    hours?: number;
  } = {},
): PlayerProfile {
  return PlayerProfileSchema.parse({
    id: PROFILE_ID,
    displayName: "Planner",
    gameMode: options.gameMode ?? "normal",
    ...(options.availableGp === undefined ? {} : { availableGp: options.availableGp }),
    ...(options.hours === undefined ? {} : { availableHoursPerDay: options.hours }),
    skills: [{ skillId: "mining", level: 1, experience: 0 }],
    completedQuestIds: options.completedQuestIds ?? [],
    inProgressQuestIds: [],
    goals: [],
  });
}

function service(methods: TrainingMethod[], player = profile()): LevellingPlannerService {
  const profiles = new ProfileService(new MemoryProfiles(player), {} as PlayerStatsProvider);
  return new LevellingPlannerService(
    new MemoryTraining(methods),
    profiles,
    undefined,
    undefined,
    () => new Date(CHECKED_AT),
  );
}

describe("LevellingPlannerService", () => {
  it("builds and groups a deterministic multi-stage fastest plan", async () => {
    const planner = service([
      method("copper", {
        minimumLevel: 1,
        maximumLevel: 10,
        xp: { minimum: 100, maximum: 200 },
      }),
      method("iron", {
        minimumLevel: 10,
        xp: { minimum: 1_000, maximum: 2_000 },
      }),
    ]);

    const plan = await planner.createPlan({
      profileId: PROFILE_ID,
      skillId: "mining",
      targetLevel: 20,
      strategy: "fastest",
    });

    expect(plan.stages.map((stage) => stage.method.id)).toEqual(["copper", "iron"]);
    expect(plan.stages.map((stage) => stage.experienceRequired)).toEqual([1_154, 3_316]);
    expect(plan.experienceRequired).toBe(4_470);
    expect(plan.totalHoursRange).toEqual({ minimum: 7.428, maximum: 14.856 });
    expect(plan.warnings).toContain(
      "Total cost/profit is unknown because at least one selected method has no reliable GP rate.",
    );
  });

  it("selects the cheapest known method and recalculates exact cost from remaining XP", async () => {
    const planner = service([
      method("fast-expensive", {
        minimumLevel: 1,
        xp: { minimum: 2_000, maximum: 2_000 },
        gpPerXp: 10,
      }),
      method("slow-cheap", {
        minimumLevel: 1,
        xp: { minimum: 1_000, maximum: 1_000 },
        gpPerXp: 1,
      }),
    ]);

    const plan = await planner.createPlan({
      profileId: PROFILE_ID,
      skillId: "mining",
      targetLevel: 10,
      strategy: "cheapest",
      budgetGp: 1_000,
    });
    expect(plan.stages).toHaveLength(1);
    expect(plan.stages[0]?.method.id).toBe("slow-cheap");
    expect(plan.totalGpRange).toEqual({ minimum: 1_154, maximum: 1_154 });
    expect(plan.feasible).toBe(false);
  });

  it("honours AFK ranking and daily-time weekly constraints", async () => {
    const planner = service(
      [
        method("active", {
          minimumLevel: 1,
          xp: { minimum: 5_000, maximum: 5_000 },
          afkRating: "not-afk",
        }),
        method("afk", {
          minimumLevel: 1,
          xp: { minimum: 1_000, maximum: 1_000 },
          afkRating: "high",
          intensity: "low",
        }),
      ],
      profile({ hours: 0.1 }),
    );
    const weekly = await planner.createWeeklyGoalPlan({
      profileId: PROFILE_ID,
      skillId: "mining",
      targetLevel: 20,
      strategy: "afk",
      weeks: 1,
    });
    expect(weekly.plan.stages[0]?.method.id).toBe("afk");
    expect(weekly.weeklyExperienceTarget).toBe(4_470);
    expect(weekly.achievableWithinPeriod).toBe(false);
  });

  it("rejects uncovered ranges, missing rates, quest gates, and Ironman exclusions", async () => {
    await expect(
      service([
        method("late", {
          minimumLevel: 10,
          xp: { minimum: 1_000, maximum: 1_000 },
        }),
      ]).createPlan({
        profileId: PROFILE_ID,
        skillId: "mining",
        targetLevel: 20,
      }),
    ).rejects.toMatchObject({ code: "UNREACHABLE_LEVEL_TARGET" });

    await expect(
      service([method("unknown", { minimumLevel: 1 })]).createPlan({
        profileId: PROFILE_ID,
        skillId: "mining",
        targetLevel: 10,
        methodId: "unknown",
      }),
    ).rejects.toMatchObject({ code: "MISSING_TRAINING_RATE" });

    await expect(
      service([
        method("quest-gated", {
          minimumLevel: 1,
          xp: { minimum: 1_000, maximum: 1_000 },
          questRequirements: ["Plague's End"],
        }),
      ]).createPlan({
        profileId: PROFILE_ID,
        skillId: "mining",
        targetLevel: 10,
      }),
    ).rejects.toMatchObject({ code: "UNREACHABLE_LEVEL_TARGET" });

    await expect(
      service(
        [
          method("not-for-ironmen", {
            minimumLevel: 1,
            xp: { minimum: 1_000, maximum: 1_000 },
            ironmanCompatibility: "unsupported",
          }),
        ],
        profile({ gameMode: "ironman" }),
      ).createPlan({
        profileId: PROFILE_ID,
        skillId: "mining",
        targetLevel: 10,
      }),
    ).rejects.toMatchObject({ code: "UNREACHABLE_LEVEL_TARGET" });
  });

  it("requires explicit opt-in for virtual targets", async () => {
    const defenceProfile = PlayerProfileSchema.parse({
      ...profile(),
      skills: [{ skillId: "defence", level: 99, experience: 13_034_431 }],
    });
    const planner = service(
      [
        method("virtual-defence", {
          skillId: "defence",
          minimumLevel: 99,
          xp: { minimum: 1_000_000, maximum: 1_000_000 },
        }),
      ],
      defenceProfile,
    );
    await expect(
      planner.createPlan({
        profileId: PROFILE_ID,
        skillId: "defence",
        targetLevel: 120,
      }),
    ).rejects.toMatchObject({ code: "VIRTUAL_LEVEL_OPT_IN_REQUIRED" });
    const plan = await planner.createPlan({
      profileId: PROFILE_ID,
      skillId: "defence",
      targetLevel: 120,
      allowVirtualLevels: true,
    });
    expect(plan.virtualTarget).toBe(true);
  });

  it("exposes missing-rate comparisons without fake estimates", async () => {
    const comparisons = await service([method("documented-no-rate", { minimumLevel: 1 })]).compare({
      profileId: PROFILE_ID,
      skillId: "mining",
      targetLevel: 10,
    });
    expect(comparisons[0]?.hoursRange).toBeUndefined();
    expect(comparisons[0]?.warnings).toContain(
      "The source does not publish a usable XP/hour rate for this method.",
    );
  });
});
