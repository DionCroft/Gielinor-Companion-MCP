import { CompanionError } from "./errors.js";

export const MAX_VIRTUAL_LEVEL = 126;
export const MAX_EXPERIENCE = 5_800_000_000;

const EXPERIENCE_TABLE: readonly number[] = (() => {
  const table: number[] = [0, 0];
  let points = 0;

  for (let level = 1; level < MAX_VIRTUAL_LEVEL; level += 1) {
    points += Math.floor(level + 300 * 2 ** (level / 7));
    table[level + 1] = Math.floor(points / 4);
  }

  return Object.freeze(table);
})();

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_VIRTUAL_LEVEL) {
    throw new CompanionError(
      `Level must be an integer from 1 to ${MAX_VIRTUAL_LEVEL}`,
      "INVALID_LEVEL",
    );
  }
}

function assertExperience(experience: number): void {
  if (!Number.isSafeInteger(experience) || experience < 0 || experience > MAX_EXPERIENCE) {
    throw new CompanionError(
      `Experience must be a safe integer from 0 to ${MAX_EXPERIENCE}`,
      "INVALID_EXPERIENCE",
    );
  }
}

export function experienceForLevel(level: number): number {
  assertLevel(level);
  const experience = EXPERIENCE_TABLE[level];

  if (experience === undefined) {
    throw new CompanionError("The XP table is incomplete", "XP_TABLE_ERROR");
  }

  return experience;
}

export function levelFromExperience(experience: number): number {
  assertExperience(experience);

  let low = 1;
  let high = MAX_VIRTUAL_LEVEL;

  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (experienceForLevel(midpoint) <= experience) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }

  return low;
}

export type SkillProgress = {
  currentExperience: number;
  currentLevel: number;
  targetLevel: number;
  targetExperience: number;
  experienceRemaining: number;
  progressPercent: number;
};

export function calculateSkillProgress(
  currentExperience: number,
  targetLevel: number,
): SkillProgress {
  assertExperience(currentExperience);
  assertLevel(targetLevel);

  const targetExperience = experienceForLevel(targetLevel);
  const currentLevel = levelFromExperience(currentExperience);
  const experienceRemaining = Math.max(0, targetExperience - currentExperience);
  const progressPercent =
    targetExperience === 0
      ? 100
      : Math.min(100, Number(((currentExperience / targetExperience) * 100).toFixed(2)));

  return {
    currentExperience,
    currentLevel,
    targetLevel,
    targetExperience,
    experienceRemaining,
    progressPercent,
  };
}
