import {
  MissingQuestRequirementsSchema,
  QuestAvailabilitySchema,
  QuestDataSnapshotSchema,
  QuestRouteSchema,
  QuestSchema,
  QuestShoppingListSchema,
  QuestSyncResultSchema,
  type MissingQuestRequirement,
  type MissingQuestRequirements,
  type MissingSkillRequirement,
  type PlayerProfile,
  type Quest,
  type QuestAvailability,
  type QuestDataStatus,
  type QuestPrerequisite,
  type QuestRoute,
  type QuestRouteAlternative,
  type QuestRouteStep,
  type QuestShoppingList,
  type QuestShoppingListItem,
  type QuestStatus,
  type QuestSyncResult,
} from "@gielinor/shared-types";

import { CompanionError, NotFoundError } from "./errors.js";
import type { QuestDataProvider, QuestRepository } from "./ports.js";
import type { ProfileService, QuestStatusUpdate } from "./profile-service.js";

function questStatus(profile: PlayerProfile, questId: string): QuestStatus {
  if (profile.completedQuestIds.includes(questId)) {
    return "completed";
  }
  if (profile.inProgressQuestIds.includes(questId)) {
    return "in-progress";
  }
  return "not-started";
}

function requirementSatisfied(
  status: QuestStatus,
  requiredStatus: "started" | "completed",
): boolean {
  return requiredStatus === "started"
    ? status === "in-progress" || status === "completed"
    : status === "completed";
}

function skillLevel(profile: PlayerProfile, skillId: string): number {
  return profile.skills.find((skill) => skill.skillId === skillId)?.level ?? 1;
}

type RouteState = {
  readonly quests: ReadonlyMap<string, Quest>;
  readonly profile: PlayerProfile;
  readonly temporary: Set<string>;
  readonly permanent: Set<string>;
  readonly steps: QuestRouteStep[];
  readonly alternatives: QuestRouteAlternative[];
};

function prerequisiteCost(
  questId: string,
  state: RouteState,
  seen: ReadonlySet<string> = new Set(),
): number {
  if (seen.has(questId) || questStatus(state.profile, questId) === "completed") {
    return 0;
  }
  const quest = state.quests.get(questId);
  if (quest === undefined) {
    return 1;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(questId);
  let cost = 1;
  for (const group of quest.prerequisiteGroups) {
    const costs = group.quests.map(
      (requirement) => prerequisiteCost(requirement.questId, state, nextSeen) + 1,
    );
    cost +=
      group.mode === "any" ? Math.min(...costs) : costs.reduce((sum, value) => sum + value, 0);
  }
  return cost;
}

function visitQuest(
  questId: string,
  requiredStatus: "started" | "completed",
  state: RouteState,
): void {
  const currentStatus = questStatus(state.profile, questId);
  if (requirementSatisfied(currentStatus, requiredStatus) || state.permanent.has(questId)) {
    return;
  }
  if (state.temporary.has(questId)) {
    throw new CompanionError(
      `Quest prerequisite cycle detected at ${questId}`,
      "QUEST_PREREQUISITE_CYCLE",
    );
  }

  const quest = state.quests.get(questId);
  if (quest === undefined) {
    throw new CompanionError(`Quest data is missing prerequisite ${questId}`, "MISSING_QUEST_DATA");
  }

  state.temporary.add(questId);
  for (const group of quest.prerequisiteGroups) {
    const unsatisfied = group.quests.filter(
      (requirement) =>
        !requirementSatisfied(
          questStatus(state.profile, requirement.questId),
          requirement.requiredStatus,
        ),
    );
    if (unsatisfied.length === 0) {
      continue;
    }

    const selected =
      group.mode === "all"
        ? unsatisfied
        : [
            [...unsatisfied].sort(
              (left, right) =>
                prerequisiteCost(left.questId, state) - prerequisiteCost(right.questId, state) ||
                left.questId.localeCompare(right.questId),
            )[0] as QuestPrerequisite,
          ];
    if (group.mode === "any") {
      state.alternatives.push({
        groupQuestId: quest.id,
        selectedQuestId: selected[0]?.questId ?? "",
        alternativeQuestIds: unsatisfied.map((requirement) => requirement.questId),
      });
    }
    for (const requirement of selected) {
      visitQuest(requirement.questId, requirement.requiredStatus, state);
    }
  }
  state.temporary.delete(questId);
  state.permanent.add(questId);
  state.steps.push({
    order: state.steps.length + 1,
    questId: quest.id,
    name: quest.name,
    currentStatus,
    requiredStatus,
    ...(quest.guideUrl === undefined ? {} : { guideUrl: quest.guideUrl }),
  });
}

function recommendation(
  quest: Quest,
  profile: PlayerProfile,
): Pick<QuestAvailability, "recommendationScore" | "recommendationReasons"> {
  let score = (quest.questPointReward ?? 0) * 10;
  const reasons: string[] = [];
  if ((quest.questPointReward ?? 0) > 0) {
    reasons.push(`${quest.questPointReward} quest point reward`);
  }
  if (profile.goals.some((goal) => goal.type === "quest" && goal.targetId === quest.id)) {
    score += 100;
    reasons.push("matches a saved quest goal");
  }
  if (quest.itemRequirements.length === 0) {
    score += 2;
    reasons.push("no structured required items");
  }
  if (quest.members === false) {
    score += 1;
    reasons.push("free-to-play");
  }
  return { recommendationScore: score, recommendationReasons: reasons };
}

export class QuestService {
  public constructor(
    private readonly repository: QuestRepository,
    private readonly profiles: ProfileService,
    private readonly provider?: QuestDataProvider,
  ) {}

  public async search(query: string, limit = 20): Promise<Quest[]> {
    const normalized = query.trim();
    if (normalized.length === 0) {
      throw new CompanionError("Quest search text cannot be empty", "INVALID_INPUT");
    }
    return (await this.repository.search(normalized, Math.min(Math.max(limit, 1), 100))).map(
      (quest) => QuestSchema.parse(quest),
    );
  }

  public async get(identifier: string): Promise<Quest> {
    const quest = await this.repository.getByIdOrAlias(identifier.trim());
    if (quest === null) {
      throw new NotFoundError("Quest");
    }
    return QuestSchema.parse(quest);
  }

  public async listAll(): Promise<Quest[]> {
    return (await this.repository.list()).map((quest) => QuestSchema.parse(quest));
  }

  public async setStatus(
    profileId: string,
    identifier: string,
    status: QuestStatus,
  ): Promise<PlayerProfile> {
    return this.setMultipleStatuses(profileId, [{ questId: identifier, status }]);
  }

  public async setMultipleStatuses(
    profileId: string,
    updates: ReadonlyArray<QuestStatusUpdate>,
  ): Promise<PlayerProfile> {
    if (updates.length === 0) {
      throw new CompanionError("At least one quest status update is required", "INVALID_INPUT");
    }
    const canonicalUpdates: QuestStatusUpdate[] = [];
    for (const update of updates) {
      const quest = await this.get(update.questId);
      canonicalUpdates.push({ questId: quest.id, status: update.status });
    }
    return this.profiles.updateQuestStatuses(profileId, canonicalUpdates);
  }

  public async listAvailable(profileId: string): Promise<QuestAvailability[]> {
    const profile = await this.profiles.get(profileId);
    const quests = await this.repository.list();
    const questPoints = quests
      .filter((quest) => profile.completedQuestIds.includes(quest.id))
      .reduce((total, quest) => total + (quest.questPointReward ?? 0), 0);
    const available = quests
      .filter((quest) => questStatus(profile, quest.id) === "not-started")
      .filter((quest) =>
        quest.prerequisiteGroups.every((group) => {
          const results = group.quests.map((requirement) =>
            requirementSatisfied(
              questStatus(profile, requirement.questId),
              requirement.requiredStatus,
            ),
          );
          return group.mode === "all" ? results.every(Boolean) : results.some(Boolean);
        }),
      )
      .filter((quest) =>
        quest.skillRequirements.every(
          (requirement) => skillLevel(profile, requirement.skillId) >= requirement.level,
        ),
      )
      .filter(
        (quest) =>
          quest.questPointRequirement === undefined || questPoints >= quest.questPointRequirement,
      )
      .map((quest) =>
        QuestAvailabilitySchema.parse({
          quest,
          status: "not-started",
          manualRequirements: quest.otherRequirements,
          ...recommendation(quest, profile),
        }),
      )
      .sort(
        (left, right) =>
          right.recommendationScore - left.recommendationScore ||
          left.quest.name.localeCompare(right.quest.name),
      );
    return available;
  }

  public async createRoute(profileId: string, identifier: string): Promise<QuestRoute> {
    const [profile, target, questList] = await Promise.all([
      this.profiles.get(profileId),
      this.get(identifier),
      this.repository.list(),
    ]);
    const quests = new Map(questList.map((quest) => [quest.id, quest]));
    const state: RouteState = {
      quests,
      profile,
      temporary: new Set(),
      permanent: new Set(),
      steps: [],
      alternatives: [],
    };
    visitQuest(target.id, "completed", state);
    return QuestRouteSchema.parse({
      targetQuestId: target.id,
      steps: state.steps,
      alternatives: state.alternatives,
    });
  }

  public async listMissingRequirements(
    profileId: string,
    identifier: string,
  ): Promise<MissingQuestRequirements> {
    const [profile, route] = await Promise.all([
      this.profiles.get(profileId),
      this.createRoute(profileId, identifier),
    ]);
    const catalog = await this.repository.list();
    const questPoints = catalog
      .filter((quest) => profile.completedQuestIds.includes(quest.id))
      .reduce((total, quest) => total + (quest.questPointReward ?? 0), 0);
    const quests: MissingQuestRequirement[] = route.steps
      .filter(
        (step) =>
          step.questId !== route.targetQuestId &&
          !requirementSatisfied(step.currentStatus, step.requiredStatus),
      )
      .map((step) => ({
        questId: step.questId,
        name: step.name,
        currentStatus: step.currentStatus,
        requiredStatus: step.requiredStatus,
      }));
    const missingSkills = new Map<string, MissingSkillRequirement>();
    const manualRequirements = new Set<string>();
    for (const step of route.steps) {
      const quest = await this.get(step.questId);
      for (const requirement of quest.skillRequirements) {
        const currentLevel = skillLevel(profile, requirement.skillId);
        if (currentLevel >= requirement.level) {
          continue;
        }
        const existing = missingSkills.get(requirement.skillId);
        if (existing === undefined) {
          missingSkills.set(requirement.skillId, {
            skillId: requirement.skillId,
            currentLevel,
            requiredLevel: requirement.level,
            requiredByQuestIds: [quest.id],
          });
        } else {
          existing.requiredLevel = Math.max(existing.requiredLevel, requirement.level);
          if (!existing.requiredByQuestIds.includes(quest.id)) {
            existing.requiredByQuestIds.push(quest.id);
          }
        }
      }
      for (const requirement of quest.otherRequirements) {
        manualRequirements.add(`${quest.name}: ${requirement}`);
      }
      if (quest.questPointRequirement !== undefined && questPoints < quest.questPointRequirement) {
        manualRequirements.add(
          `${quest.name}: ${quest.questPointRequirement} quest points required; ${questPoints} tracked`,
        );
      }
    }
    return MissingQuestRequirementsSchema.parse({
      targetQuestId: route.targetQuestId,
      quests,
      skills: [...missingSkills.values()].sort((left, right) =>
        left.skillId.localeCompare(right.skillId),
      ),
      manualRequirements: [...manualRequirements].sort(),
    });
  }

  public async createShoppingList(
    profileId: string,
    identifier: string,
  ): Promise<QuestShoppingList> {
    const route = await this.createRoute(profileId, identifier);
    const aggregated = new Map<string, QuestShoppingListItem>();
    for (const step of route.steps) {
      const quest = await this.get(step.questId);
      for (const item of quest.itemRequirements) {
        const key = `${item.itemId ?? ""}:${item.name.toLocaleLowerCase()}`;
        const existing = aggregated.get(key);
        if (existing === undefined) {
          aggregated.set(key, {
            name: item.name,
            quantity: item.quantity,
            ...(item.itemId === undefined ? {} : { itemId: item.itemId }),
            alternatives: [...new Set(item.alternatives ?? [])],
            requiredByQuestIds: [quest.id],
          });
        } else {
          existing.quantity += item.quantity;
          existing.alternatives = [
            ...new Set([...existing.alternatives, ...(item.alternatives ?? [])]),
          ];
          if (!existing.requiredByQuestIds.includes(quest.id)) {
            existing.requiredByQuestIds.push(quest.id);
          }
        }
      }
    }
    return QuestShoppingListSchema.parse({
      targetQuestId: route.targetQuestId,
      routeQuestIds: route.steps.map((step) => step.questId),
      items: [...aggregated.values()].sort((left, right) => left.name.localeCompare(right.name)),
    });
  }

  public async refreshData(): Promise<QuestSyncResult> {
    if (this.provider === undefined) {
      throw new CompanionError("Quest data refresh is not configured", "UNSUPPORTED_FEATURE");
    }
    const attemptedAt = new Date().toISOString();
    try {
      const snapshot = QuestDataSnapshotSchema.parse(await this.provider.fetchSnapshot());
      return QuestSyncResultSchema.parse(await this.repository.replaceSnapshot(snapshot));
    } catch (error) {
      const code = error instanceof CompanionError ? error.code : "QUEST_SYNC_FAILED";
      const message =
        error instanceof CompanionError
          ? error.message
          : "Quest data refresh could not be completed";
      await this.repository.recordSyncFailure(code, message, attemptedAt);
      throw error;
    }
  }

  public async getDataStatus(): Promise<QuestDataStatus> {
    return this.repository.getDataStatus();
  }
}
