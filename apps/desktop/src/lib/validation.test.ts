import {
  CreateProfileFormSchema,
  ItemSearchFormSchema,
  LevellingPlanFormSchema,
  QuestSearchFormSchema,
} from "./validation.js";

describe("desktop form validation", () => {
  it("accepts a normal public profile", () => {
    expect(
      CreateProfileFormSchema.safeParse({
        displayName: "Adventurer",
        gameMode: "normal",
      }).success,
    ).toBe(true);
  });

  it("rejects credentials and overlong display names", () => {
    expect(
      CreateProfileFormSchema.safeParse({
        displayName: "this-name-is-far-too-long",
        gameMode: "normal",
        password: "never accepted",
      }).success,
    ).toBe(false);
  });

  it("requires useful search terms", () => {
    expect(QuestSearchFormSchema.safeParse({ query: "p" }).success).toBe(false);
    expect(ItemSearchFormSchema.safeParse({ query: "coal" }).success).toBe(true);
  });

  it("coerces bounded levelling inputs", () => {
    const result = LevellingPlanFormSchema.safeParse({
      skillId: "mining",
      targetLevel: "99",
      strategy: "balanced",
      budgetGp: "1000000",
      hoursPerDay: "2",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetLevel).toBe(99);
      expect(result.data.budgetGp).toBe(1_000_000);
    }
  });
});
