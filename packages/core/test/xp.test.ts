import { describe, expect, it } from "vitest";

import {
  calculateSkillProgress,
  experienceForLevel,
  getSkillLevelCap,
  isVirtualLevel,
  levelFromExperience,
} from "../src/xp.js";

describe("RuneScape XP calculations", () => {
  it.each([
    [1, 0],
    [2, 83],
    [50, 101_333],
    [99, 13_034_431],
    [120, 104_273_167],
    [126, 188_884_740],
  ])("maps level %i to %i XP", (level, experience) => {
    expect(experienceForLevel(level)).toBe(experience);
  });

  it("maps XP to the highest attained level", () => {
    expect(levelFromExperience(13_034_430)).toBe(98);
    expect(levelFromExperience(13_034_431)).toBe(99);
    expect(levelFromExperience(200_000_000)).toBe(126);
  });

  it("never reports negative XP remaining", () => {
    expect(calculateSkillProgress(20_000_000, 99)).toEqual({
      currentExperience: 20_000_000,
      currentLevel: 103,
      targetLevel: 99,
      targetExperience: 13_034_431,
      experienceRemaining: 0,
      progressPercent: 100,
    });
  });

  it("rejects unsupported target levels", () => {
    expect(() => experienceForLevel(127)).toThrow(/1 to 126/);
  });

  it.each([
    [2, 830],
    [99, 36_073_511],
    [120, 80_618_654],
    [150, 194_927_409],
  ])("maps Invention level %i to elite-curve XP %i", (level, experience) => {
    expect(experienceForLevel(level, "invention")).toBe(experience);
    expect(levelFromExperience(experience, "invention")).toBe(level);
  });

  it("uses current true skill caps while supporting explicit virtual calculations", () => {
    expect(getSkillLevelCap("defence")).toBe(99);
    expect(getSkillLevelCap("mining")).toBe(110);
    expect(getSkillLevelCap("construction")).toBe(120);
    expect(isVirtualLevel("defence", 120)).toBe(true);
    expect(isVirtualLevel("construction", 120)).toBe(false);
    expect(calculateSkillProgress(0, 120, "invention")).toMatchObject({
      targetExperience: 80_618_654,
      trueSkillCap: 120,
      virtualTarget: false,
    });
  });

  it("rejects non-Invention level 150", () => {
    expect(() => experienceForLevel(150, "mining")).toThrow(/1 to 126/);
  });
});
