import { SKILL_LEVEL_CAPS, type SkillId } from "@gielinor/shared-types";

import { CompanionError } from "./errors.js";

export const MAX_VIRTUAL_LEVEL = 126;
export const MAX_INVENTION_VIRTUAL_LEVEL = 150;
export const MAX_EXPERIENCE = 5_800_000_000;
export const XP_TABLE_SOURCE = {
  name: "RuneScape Wiki — Experience/Table",
  url: "https://runescape.wiki/w/Experience/Table",
  revision: "37100263",
  updatedAt: "2026-07-15T08:40:45Z",
} as const;

const STANDARD_EXPERIENCE_TABLE: readonly number[] = (() => {
  const table: number[] = [0, 0];
  let points = 0;

  for (let level = 1; level < MAX_VIRTUAL_LEVEL; level += 1) {
    points += Math.floor(level + 300 * 2 ** (level / 7));
    table[level + 1] = Math.floor(points / 4);
  }

  return Object.freeze(table);
})();

/**
 * The authoritative elite-skill curve. Unlike standard skills, Invention does
 * not use the classic exponential formula. Indexes are level numbers.
 */
const INVENTION_EXPERIENCE_TABLE: readonly number[] = Object.freeze([
  0, 0, 830, 1_861, 2_902, 3_980, 5_126, 6_380, 7_787, 9_400, 11_275, 13_605, 16_372, 19_656,
  23_546, 28_134, 33_520, 39_809, 47_109, 55_535, 65_209, 77_190, 90_811, 106_221, 123_573, 143_025,
  164_742, 188_893, 215_651, 245_196, 277_713, 316_311, 358_547, 404_634, 454_796, 509_259, 568_254,
  632_019, 700_797, 774_834, 854_383, 946_227, 1_044_569, 1_149_696, 1_261_903, 1_381_488,
  1_508_756, 1_644_015, 1_787_581, 1_939_773, 2_100_917, 2_283_490, 2_476_369, 2_679_917, 2_894_505,
  3_120_508, 3_358_307, 3_608_290, 3_870_846, 4_146_374, 4_435_275, 4_758_122, 5_096_111, 5_449_685,
  5_819_299, 6_205_407, 6_608_473, 7_028_964, 7_467_354, 7_924_122, 8_399_751, 8_925_664, 9_472_665,
  10_041_285, 10_632_061, 11_245_538, 11_882_262, 12_542_789, 13_227_679, 13_937_496, 14_672_812,
  15_478_994, 16_313_404, 17_176_661, 18_069_395, 18_992_239, 19_945_833, 20_930_821, 21_947_856,
  22_997_593, 24_080_695, 25_259_906, 26_475_754, 27_728_955, 29_020_233, 30_350_318, 31_719_944,
  33_129_852, 34_580_790, 36_073_511, 37_608_773, 39_270_442, 40_978_509, 42_733_789, 44_537_107,
  46_389_292, 48_291_180, 50_243_611, 52_247_435, 54_303_504, 56_412_678, 58_575_824, 60_793_812,
  63_067_521, 65_397_835, 67_785_643, 70_231_841, 72_737_330, 75_303_019, 77_929_820, 80_618_654,
  83_370_445, 86_186_124, 89_066_630, 92_012_904, 95_025_896, 98_106_559, 101_255_855, 104_474_750,
  107_764_216, 111_125_230, 114_558_777, 118_065_845, 121_647_430, 125_304_532, 129_038_159,
  132_849_323, 136_739_041, 140_708_338, 144_758_242, 148_889_790, 153_104_021, 157_401_983,
  161_784_728, 166_253_312, 170_808_801, 175_452_262, 180_184_770, 185_007_406, 189_921_255,
  194_927_409,
]);

function maximumLevel(skillId?: SkillId): number {
  return skillId === "invention" ? MAX_INVENTION_VIRTUAL_LEVEL : MAX_VIRTUAL_LEVEL;
}

function assertLevel(level: number, skillId?: SkillId): void {
  const maximum = maximumLevel(skillId);
  if (!Number.isInteger(level) || level < 1 || level > maximum) {
    throw new CompanionError(
      `Level must be an integer from 1 to ${maximum}${skillId === undefined ? "" : ` for ${skillId}`}`,
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

export function getSkillLevelCap(skillId: SkillId): 99 | 110 | 120 {
  return SKILL_LEVEL_CAPS[skillId];
}

export function isVirtualLevel(skillId: SkillId, level: number): boolean {
  assertLevel(level, skillId);
  return level > getSkillLevelCap(skillId);
}

export function experienceForLevel(level: number, skillId?: SkillId): number {
  assertLevel(level, skillId);
  const table = skillId === "invention" ? INVENTION_EXPERIENCE_TABLE : STANDARD_EXPERIENCE_TABLE;
  const experience = table[level];

  if (experience === undefined) {
    throw new CompanionError("The XP table is incomplete", "XP_TABLE_ERROR");
  }

  return experience;
}

export function levelFromExperience(experience: number, skillId?: SkillId): number {
  assertExperience(experience);

  let low = 1;
  let high = maximumLevel(skillId);

  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (experienceForLevel(midpoint, skillId) <= experience) {
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
  trueSkillCap?: number;
  virtualTarget?: boolean;
};

export function calculateSkillProgress(
  currentExperience: number,
  targetLevel: number,
  skillId?: SkillId,
): SkillProgress {
  assertExperience(currentExperience);
  assertLevel(targetLevel, skillId);

  const targetExperience = experienceForLevel(targetLevel, skillId);
  const currentLevel = levelFromExperience(currentExperience, skillId);
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
    ...(skillId === undefined
      ? {}
      : {
          trueSkillCap: getSkillLevelCap(skillId),
          virtualTarget: isVirtualLevel(skillId, targetLevel),
        }),
  };
}
