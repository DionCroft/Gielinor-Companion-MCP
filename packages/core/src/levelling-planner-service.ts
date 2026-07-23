import {
  LevellingPlanSchema,
  SKILL_LEVEL_CAPS,
  TrainingDataSnapshotSchema,
  TrainingDataStatusSchema,
  TrainingSyncResultSchema,
  WeeklyGoalPlanSchema,
  type LevellingPlan,
  type LevellingPlanStage,
  type PlayerProfile,
  type SkillId,
  type TrainingDataStatus,
  type TrainingMethod,
  type TrainingStrategy,
  type TrainingSyncResult,
  type WeeklyGoalPlan,
} from "@gielinor/shared-types";

import { CompanionError, NotFoundError } from "./errors.js";
import type { TrainingMethodProvider, TrainingMethodRepository } from "./ports.js";
import type { ProfileService } from "./profile-service.js";
import type { QuestService } from "./quest-service.js";
import { experienceForLevel, getSkillLevelCap, isVirtualLevel, levelFromExperience } from "./xp.js";

type MethodFilters = {
  skillId?: SkillId | undefined;
  level?: number | undefined;
  members?: boolean | undefined;
  ironman?: boolean | undefined;
};

export type LevellingPlanInput = {
  profileId: string;
  skillId: SkillId;
  targetLevel: number;
  strategy?: TrainingStrategy | undefined;
  methodId?: string | undefined;
  budgetGp?: number | undefined;
  hoursPerDay?: number | undefined;
  targetDate?: string | undefined;
  members?: boolean | undefined;
  allowVirtualLevels?: boolean | undefined;
};

export type TrainingMethodComparison = {
  method: TrainingMethod;
  applicableExperience: number;
  hoursRange?: { minimum: number; maximum: number } | undefined;
  gpRange?: { minimum: number; maximum: number } | undefined;
  accessible: boolean;
  blockers: string[];
  warnings: string[];
};

type RatedTrainingMethod = TrainingMethod & {
  xpPerHourRange: { minimum: number; maximum: number };
};

type MethodAccess = {
  accessible: boolean;
  blockers: string[];
  warnings: string[];
};

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function questKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function skillLevel(profile: PlayerProfile, skillId: SkillId): number {
  return profile.skills.find((skill) => skill.skillId === skillId)?.level ?? 1;
}

function methodAccess(
  method: TrainingMethod,
  profile: PlayerProfile,
  members: boolean,
): MethodAccess {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (method.members && !members) {
    blockers.push("Requires RuneScape membership.");
  }
  const isIronman = profile.gameMode === "ironman" || profile.gameMode === "hardcore-ironman";
  if (isIronman && method.ironmanCompatibility === "unsupported") {
    blockers.push("The source marks this method as unavailable to Ironman accounts.");
  } else if (isIronman && method.ironmanCompatibility === "unknown") {
    warnings.push("Ironman compatibility is not confirmed by the source.");
  }
  const completed = new Set(profile.completedQuestIds.map(questKey));
  for (const quest of method.questRequirements) {
    if (!completed.has(questKey(quest))) {
      blockers.push(`Quest requirement not marked complete: ${quest}.`);
    }
  }
  for (const requirement of method.requirements) {
    if (requirement.type === "skill") {
      if (skillLevel(profile, requirement.skillId) < requirement.level) {
        blockers.push(
          `Requires level ${requirement.level} ${requirement.skillId}; tracked level is ${skillLevel(profile, requirement.skillId)}.`,
        );
      }
    } else if (requirement.type === "quest") {
      if (!completed.has(questKey(requirement.questId))) {
        blockers.push(`Quest requirement not marked complete: ${requirement.questId}.`);
      }
    } else {
      warnings.push(
        `Requires item ${requirement.itemId} × ${requirement.quantity}; inventory is not tracked.`,
      );
    }
  }
  if (method.itemRequirements.length > 0 || method.equipment.length > 0) {
    warnings.push("Item and equipment ownership is not tracked; verify the listed requirements.");
  }
  return { accessible: blockers.length === 0, blockers, warnings };
}

function hasXpRate(method: TrainingMethod): method is RatedTrainingMethod {
  return method.xpPerHourRange !== undefined;
}

function hoursFor(
  experience: number,
  method: RatedTrainingMethod,
): { minimum: number; maximum: number } {
  return {
    minimum: round(experience / method.xpPerHourRange.maximum, 4),
    maximum: round(experience / method.xpPerHourRange.minimum, 4),
  };
}

/**
 * Positive values mean a cost; negative values mean expected profit.
 */
function gpFor(
  experience: number,
  method: RatedTrainingMethod,
  hours: { minimum: number; maximum: number },
): { minimum: number; maximum: number } | undefined {
  if (method.gpPerXp !== undefined) {
    const total = Math.round(experience * method.gpPerXp);
    return { minimum: total, maximum: total };
  }
  if (method.gpPerHourRange === undefined) {
    return undefined;
  }
  const candidates = [
    -method.gpPerHourRange.minimum * hours.minimum,
    -method.gpPerHourRange.minimum * hours.maximum,
    -method.gpPerHourRange.maximum * hours.minimum,
    -method.gpPerHourRange.maximum * hours.maximum,
  ].map(Math.round);
  return { minimum: Math.min(...candidates), maximum: Math.max(...candidates) };
}

function afkScore(method: TrainingMethod): number {
  return (
    {
      "not-afk": 0,
      low: 1,
      moderate: 2,
      high: 3,
    } as const
  )[method.afkRating];
}

function estimatedCostPerXp(method: TrainingMethod): number | undefined {
  if (method.gpPerXp !== undefined) {
    return method.gpPerXp;
  }
  if (method.gpPerHourRange !== undefined) {
    if (method.xpPerHourRange === undefined) {
      return undefined;
    }
    const averageGp = (method.gpPerHourRange.minimum + method.gpPerHourRange.maximum) / 2;
    const averageXp = (method.xpPerHourRange.minimum + method.xpPerHourRange.maximum) / 2;
    return -averageGp / averageXp;
  }
  return undefined;
}

function selectMethod(
  methods: readonly RatedTrainingMethod[],
  strategy: TrainingStrategy,
): { method: RatedTrainingMethod; usedCostFallback: boolean } {
  if (methods.length === 0) {
    throw new CompanionError(
      "No accessible training method covers part of the requested level range",
      "UNREACHABLE_LEVEL_TARGET",
    );
  }
  const byFastest = (left: RatedTrainingMethod, right: RatedTrainingMethod) =>
    right.xpPerHourRange.minimum - left.xpPerHourRange.minimum || left.id.localeCompare(right.id);
  if (strategy === "fastest") {
    return {
      method: [...methods].sort(byFastest)[0] as RatedTrainingMethod,
      usedCostFallback: false,
    };
  }
  if (strategy === "afk") {
    return {
      method: [...methods].sort(
        (left, right) =>
          afkScore(right) - afkScore(left) ||
          right.xpPerHourRange.minimum - left.xpPerHourRange.minimum ||
          left.id.localeCompare(right.id),
      )[0] as RatedTrainingMethod,
      usedCostFallback: false,
    };
  }
  if (strategy === "cheapest") {
    const priced = methods.filter((method) => estimatedCostPerXp(method) !== undefined);
    if (priced.length === 0) {
      return {
        method: [...methods].sort(byFastest)[0] as RatedTrainingMethod,
        usedCostFallback: true,
      };
    }
    return {
      method: [...priced].sort(
        (left, right) =>
          (estimatedCostPerXp(left) as number) - (estimatedCostPerXp(right) as number) ||
          byFastest(left, right),
      )[0] as RatedTrainingMethod,
      usedCostFallback: false,
    };
  }
  return {
    method: [...methods].sort((left, right) => {
      const leftCost = estimatedCostPerXp(left);
      const rightCost = estimatedCostPerXp(right);
      const leftScore =
        (left.xpPerHourRange.minimum * (1 + afkScore(left) * 0.12)) /
        (leftCost === undefined ? 1.15 : 1 + Math.max(0, leftCost) / 10);
      const rightScore =
        (right.xpPerHourRange.minimum * (1 + afkScore(right) * 0.12)) /
        (rightCost === undefined ? 1.15 : 1 + Math.max(0, rightCost) / 10);
      return rightScore - leftScore || left.id.localeCompare(right.id);
    })[0] as RatedTrainingMethod,
    usedCostFallback: false,
  };
}

function totals(stages: readonly LevellingPlanStage[]): {
  hours: { minimum: number; maximum: number };
  gp?: { minimum: number; maximum: number } | undefined;
} {
  const hours = stages.reduce(
    (total, stage) => ({
      minimum: total.minimum + stage.hoursRange.minimum,
      maximum: total.maximum + stage.hoursRange.maximum,
    }),
    { minimum: 0, maximum: 0 },
  );
  const gpStages = stages.map((stage) => stage.gpRange);
  let gp: { minimum: number; maximum: number } | undefined;
  if (gpStages.every((range) => range !== undefined)) {
    gp = { minimum: 0, maximum: 0 };
    for (const range of gpStages) {
      gp.minimum += range.minimum;
      gp.maximum += range.maximum;
    }
  }
  return {
    hours: { minimum: round(hours.minimum, 4), maximum: round(hours.maximum, 4) },
    ...(gp === undefined
      ? {}
      : { gp: { minimum: Math.round(gp.minimum), maximum: Math.round(gp.maximum) } }),
  };
}

export class LevellingPlannerService {
  private readonly now: () => Date;

  public constructor(
    private readonly repository: TrainingMethodRepository,
    private readonly profiles: ProfileService,
    private readonly quests?: QuestService,
    private readonly provider?: TrainingMethodProvider,
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  public async list(filters: MethodFilters = {}): Promise<TrainingMethod[]> {
    const methods = await this.repository.list({
      ...(filters.skillId === undefined ? {} : { skillId: filters.skillId }),
      ...(filters.level === undefined ? {} : { level: filters.level }),
    });
    return methods.filter(
      (method) =>
        (filters.members !== false || !method.members) &&
        (filters.ironman !== true || method.ironmanCompatibility !== "unsupported"),
    );
  }

  public async get(id: string): Promise<TrainingMethod> {
    const method = await this.repository.getById(id.trim());
    if (method === null) {
      throw new NotFoundError("Training method");
    }
    return method;
  }

  public async compare(input: {
    profileId: string;
    skillId: SkillId;
    targetLevel: number;
    methodIds?: readonly string[] | undefined;
    members?: boolean | undefined;
    allowVirtualLevels?: boolean | undefined;
  }): Promise<TrainingMethodComparison[]> {
    const profile = await this.profiles.get(input.profileId);
    const skill = profile.skills.find((candidate) => candidate.skillId === input.skillId);
    if (skill === undefined) {
      throw new NotFoundError(`Skill ${input.skillId}; refresh the public Hiscores first`);
    }
    this.validateTarget(input.skillId, input.targetLevel, input.allowVirtualLevels ?? false);
    const targetExperience = experienceForLevel(input.targetLevel, input.skillId);
    const wanted = input.methodIds === undefined ? undefined : new Set(input.methodIds);
    const methods = (await this.repository.list({ skillId: input.skillId })).filter(
      (method) => wanted === undefined || wanted.has(method.id),
    );
    return methods
      .map((method) => {
        const startExperience = Math.max(
          skill.experience,
          experienceForLevel(method.minimumLevel, input.skillId),
        );
        const endLevel = Math.min(input.targetLevel, method.maximumLevel ?? input.targetLevel);
        const endExperience = experienceForLevel(endLevel, input.skillId);
        const applicableExperience = Math.max(
          0,
          Math.min(targetExperience, endExperience) - startExperience,
        );
        const access = methodAccess(method, profile, input.members ?? true);
        let hours: { minimum: number; maximum: number } | undefined;
        let gp: { minimum: number; maximum: number } | undefined;
        if (hasXpRate(method)) {
          hours = hoursFor(applicableExperience, method);
          gp = gpFor(applicableExperience, method, hours);
        } else {
          access.warnings.push(
            "The source does not publish a usable XP/hour rate for this method.",
          );
        }
        return {
          method,
          applicableExperience,
          ...(hours === undefined ? {} : { hoursRange: hours }),
          ...(gp === undefined ? {} : { gpRange: gp }),
          ...access,
        };
      })
      .filter((result) => result.applicableExperience > 0)
      .sort(
        (left, right) =>
          (left.hoursRange?.maximum ?? Number.POSITIVE_INFINITY) -
            (right.hoursRange?.maximum ?? Number.POSITIVE_INFINITY) ||
          left.method.id.localeCompare(right.method.id),
      );
  }

  public async createPlan(input: LevellingPlanInput): Promise<LevellingPlan> {
    const profile = await this.profiles.get(input.profileId);
    const skill = profile.skills.find((candidate) => candidate.skillId === input.skillId);
    if (skill === undefined) {
      throw new NotFoundError(`Skill ${input.skillId}; refresh the public Hiscores first`);
    }
    this.validateTarget(input.skillId, input.targetLevel, input.allowVirtualLevels ?? false);
    const currentExperience = skill.experience;
    const currentLevel = levelFromExperience(currentExperience, input.skillId);
    const targetExperience = experienceForLevel(input.targetLevel, input.skillId);
    const strategy = input.strategy ?? profile.preferredPlayStyle ?? "balanced";
    const generatedAt = this.now();
    const experienceRequired = Math.max(0, targetExperience - currentExperience);
    if (experienceRequired === 0) {
      return LevellingPlanSchema.parse({
        skillId: input.skillId,
        strategy,
        currentLevel,
        currentExperience,
        targetLevel: input.targetLevel,
        targetExperience,
        trueSkillCap: getSkillLevelCap(input.skillId),
        virtualTarget: isVirtualLevel(input.skillId, input.targetLevel),
        experienceRequired,
        stages: [],
        totalHoursRange: { minimum: 0, maximum: 0 },
        feasible: true,
        warnings: [],
        assumptions: ["The target XP has already been reached."],
        generatedAt: generatedAt.toISOString(),
      });
    }
    const allMethods = await this.repository.list({ skillId: input.skillId });
    const forced =
      input.methodId === undefined
        ? undefined
        : allMethods.find((method) => method.id === input.methodId);
    if (input.methodId !== undefined && forced === undefined) {
      throw new NotFoundError("Training method");
    }
    if (forced !== undefined && !hasXpRate(forced)) {
      throw new CompanionError(
        "The selected training method has no source-backed XP/hour rate",
        "MISSING_TRAINING_RATE",
      );
    }
    const accessById = new Map(
      allMethods.map((method) => [method.id, methodAccess(method, profile, input.members ?? true)]),
    );
    const selectedByLevel: Array<{ level: number; method: RatedTrainingMethod }> = [];
    let usedCostFallback = false;
    for (let level = currentLevel; level < input.targetLevel; level += 1) {
      const candidates = (forced === undefined ? allMethods : [forced]).filter(
        (method): method is RatedTrainingMethod => {
          const access = accessById.get(method.id);
          return (
            hasXpRate(method) &&
            method.minimumLevel <= level &&
            (method.maximumLevel === undefined || level < method.maximumLevel) &&
            access?.accessible === true
          );
        },
      );
      const selection = selectMethod(candidates, strategy);
      usedCostFallback ||= selection.usedCostFallback;
      selectedByLevel.push({ level, method: selection.method });
    }
    const grouped: Array<{
      startLevel: number;
      endLevel: number;
      method: RatedTrainingMethod;
    }> = [];
    for (const selection of selectedByLevel) {
      const previous = grouped.at(-1);
      if (previous !== undefined && previous.method.id === selection.method.id) {
        previous.endLevel = selection.level + 1;
      } else {
        grouped.push({
          startLevel: selection.level,
          endLevel: selection.level + 1,
          method: selection.method,
        });
      }
    }
    const stages: LevellingPlanStage[] = grouped.map((group, index) => {
      const startExperience =
        index === 0 ? currentExperience : experienceForLevel(group.startLevel, input.skillId);
      const endExperience =
        group.endLevel === input.targetLevel
          ? targetExperience
          : experienceForLevel(group.endLevel, input.skillId);
      const stageExperience = Math.max(0, endExperience - startExperience);
      const hours = hoursFor(stageExperience, group.method);
      const gp = gpFor(stageExperience, group.method, hours);
      const access = accessById.get(group.method.id);
      return {
        order: index + 1,
        method: group.method,
        startLevel: group.startLevel,
        endLevel: group.endLevel,
        startExperience,
        endExperience,
        experienceRequired: stageExperience,
        hoursRange: hours,
        ...(gp === undefined ? {} : { gpRange: gp }),
        warnings: [...(access?.warnings ?? []), ...group.method.uncertaintyNotes],
      };
    });
    const total = totals(stages);
    const warnings = new Set<string>();
    if (usedCostFallback) {
      warnings.add(
        "No GP data was available for one or more choices, so the cheapest strategy fell back to the fastest documented rate.",
      );
    }
    if (total.gp === undefined) {
      warnings.add(
        "Total cost/profit is unknown because at least one selected method has no reliable GP rate.",
      );
    }
    const effectiveBudget = input.budgetGp ?? profile.availableGp;
    let feasible = true;
    if (
      effectiveBudget !== undefined &&
      total.gp !== undefined &&
      total.gp.maximum > effectiveBudget
    ) {
      feasible = false;
      warnings.add(
        `Worst-case estimated cost ${total.gp.maximum} GP exceeds the ${effectiveBudget} GP budget.`,
      );
    }
    const hoursPerDay = input.hoursPerDay ?? profile.availableHoursPerDay;
    let completionDateRange:
      | {
          earliest: string;
          latest: string;
        }
      | undefined;
    if (hoursPerDay !== undefined) {
      const earliest = new Date(
        generatedAt.getTime() + (total.hours.minimum / hoursPerDay) * 86_400_000,
      );
      const latest = new Date(
        generatedAt.getTime() + (total.hours.maximum / hoursPerDay) * 86_400_000,
      );
      completionDateRange = {
        earliest: earliest.toISOString(),
        latest: latest.toISOString(),
      };
      if (input.targetDate !== undefined) {
        const targetDate = new Date(input.targetDate);
        if (Number.isNaN(targetDate.getTime())) {
          throw new CompanionError("Target date must be a valid ISO date-time", "INVALID_INPUT");
        }
        if (latest.getTime() > targetDate.getTime()) {
          feasible = false;
          warnings.add(
            `The conservative completion estimate is later than ${targetDate.toISOString()}.`,
          );
        }
      }
    } else if (input.targetDate !== undefined) {
      warnings.add("A target date was supplied without available hours per day.");
    }
    return LevellingPlanSchema.parse({
      skillId: input.skillId,
      strategy,
      currentLevel,
      currentExperience,
      targetLevel: input.targetLevel,
      targetExperience,
      trueSkillCap: SKILL_LEVEL_CAPS[input.skillId],
      virtualTarget: isVirtualLevel(input.skillId, input.targetLevel),
      experienceRequired,
      stages,
      totalHoursRange: total.hours,
      ...(total.gp === undefined ? {} : { totalGpRange: total.gp }),
      ...(completionDateRange === undefined ? {} : { completionDateRange }),
      feasible,
      warnings: [...warnings],
      assumptions: [
        "XP/hour remains within each source range for the time spent on that method.",
        "Rates exclude unmodelled temporary boosts, downtime, banking variance, and future game updates.",
        "Positive GP totals are costs; negative GP totals are projected profit.",
      ],
      generatedAt: generatedAt.toISOString(),
    });
  }

  public async createWeeklyGoalPlan(
    input: LevellingPlanInput & { weeks?: number | undefined },
  ): Promise<WeeklyGoalPlan> {
    const weeks = input.weeks ?? 1;
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 520) {
      throw new CompanionError("Weeks must be an integer from 1 to 520", "INVALID_INPUT");
    }
    const plan = await this.createPlan(input);
    const profile = await this.profiles.get(input.profileId);
    const hoursPerDay = input.hoursPerDay ?? profile.availableHoursPerDay;
    const achievableWithinPeriod =
      hoursPerDay === undefined || plan.totalHoursRange.maximum <= hoursPerDay * 7 * weeks;
    return WeeklyGoalPlanSchema.parse({
      plan,
      weeks,
      weeklyExperienceTarget: Math.ceil(plan.experienceRequired / weeks),
      weeklyHoursRange: {
        minimum: round(plan.totalHoursRange.minimum / weeks, 4),
        maximum: round(plan.totalHoursRange.maximum / weeks, 4),
      },
      achievableWithinPeriod,
    });
  }

  public async compareQuestXpRewards(
    skillId: SkillId,
    profileId?: string,
    limit = 20,
  ): Promise<
    Array<{
      questId: string;
      name: string;
      experience: number;
      completed: boolean;
      sourceUrl?: string | undefined;
    }>
  > {
    if (this.quests === undefined) {
      throw new CompanionError("Quest companion is not configured", "UNSUPPORTED_FEATURE");
    }
    const [quests, profile] = await Promise.all([
      this.quests.listAll(),
      profileId === undefined ? Promise.resolve(undefined) : this.profiles.get(profileId),
    ]);
    return quests
      .map((quest) => ({
        questId: quest.id,
        name: quest.name,
        experience: quest.rewards
          .filter((reward) => reward.type === "experience" && reward.skillId === skillId)
          .reduce((total, reward) => total + (reward.amount ?? 0), 0),
        completed: profile?.completedQuestIds.includes(quest.id) ?? false,
        ...(quest.guideUrl === undefined ? {} : { sourceUrl: quest.guideUrl }),
      }))
      .filter((reward) => reward.experience > 0)
      .sort(
        (left, right) => right.experience - left.experience || left.name.localeCompare(right.name),
      )
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  public async refreshData(): Promise<TrainingSyncResult> {
    if (this.provider === undefined) {
      throw new CompanionError("Training data refresh is not configured", "UNSUPPORTED_FEATURE");
    }
    const attemptedAt = this.now().toISOString();
    try {
      const snapshot = TrainingDataSnapshotSchema.parse(await this.provider.fetchSnapshot());
      return TrainingSyncResultSchema.parse(await this.repository.replaceSnapshot(snapshot));
    } catch (error) {
      const code = error instanceof CompanionError ? error.code : "TRAINING_SYNC_FAILED";
      const message =
        error instanceof CompanionError
          ? error.message
          : "Training data refresh could not be completed";
      await this.repository.recordSyncFailure(code, message, attemptedAt);
      throw error;
    }
  }

  public async getDataStatus(): Promise<TrainingDataStatus> {
    return TrainingDataStatusSchema.parse(await this.repository.getDataStatus());
  }

  private validateTarget(skillId: SkillId, targetLevel: number, allowVirtual: boolean): void {
    experienceForLevel(targetLevel, skillId);
    if (targetLevel > getSkillLevelCap(skillId) && !allowVirtual) {
      throw new CompanionError(
        `${skillId} has a true level cap of ${getSkillLevelCap(skillId)}; set allowVirtualLevels to plan beyond it`,
        "VIRTUAL_LEVEL_OPT_IN_REQUIRED",
      );
    }
  }
}
