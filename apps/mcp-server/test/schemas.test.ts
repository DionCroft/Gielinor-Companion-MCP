import { CompanionError } from "@gielinor/core";
import { describe, expect, it } from "vitest";

import {
  CreatePlayerProfileToolInputSchema,
  CreateLevellingPlanToolInputSchema,
  ImportPlayerProfileToolInputSchema,
  SetMultipleQuestStatusesToolInputSchema,
  ToolEnvelopeSchema,
} from "../src/schemas.js";
import { publicToolError } from "../src/tool-service.js";

describe("MCP tool schemas", () => {
  it("rejects unknown profile fields", () => {
    expect(
      CreatePlayerProfileToolInputSchema.safeParse({
        displayName: "Rune Tester",
        password: "never accept this",
      }).success,
    ).toBe(false);
  });

  it("validates nested profile imports strictly", () => {
    expect(
      ImportPlayerProfileToolInputSchema.safeParse({
        profile: {
          schemaVersion: 1,
          displayName: "Rune Tester",
          gameMode: "normal",
          completedQuestIds: [],
          inProgressQuestIds: [],
          goals: [],
          sessionCookie: "never accept this",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid bulk quest status input", () => {
    expect(
      SetMultipleQuestStatusesToolInputSchema.safeParse({
        profileId: "00000000-0000-4000-8000-000000000001",
        updates: [{ quest: "Plague's End", status: "done" }],
      }).success,
    ).toBe(false);
  });

  it("validates the common MCP output envelope", () => {
    expect(
      ToolEnvelopeSchema.safeParse({
        data: { valid: true },
        meta: {
          generatedAt: "2026-07-23T12:00:00.000Z",
          source: "fixture",
        },
      }).success,
    ).toBe(true);
    expect(
      ToolEnvelopeSchema.safeParse({
        data: {},
        meta: { generatedAt: "not-a-date", source: "" },
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe or invalid levelling-plan input", () => {
    expect(
      CreateLevellingPlanToolInputSchema.safeParse({
        profileId: "00000000-0000-4000-8000-000000000001",
        skillId: "mining",
        targetLevel: 110,
        hoursPerDay: 25,
      }).success,
    ).toBe(false);
    expect(
      CreateLevellingPlanToolInputSchema.safeParse({
        profileId: "00000000-0000-4000-8000-000000000001",
        skillId: "invention",
        targetLevel: 150,
        allowVirtualLevels: true,
        password: "never accept this",
      }).success,
    ).toBe(false);
  });
});

describe("MCP error responses", () => {
  it("returns stable domain errors", () => {
    expect(publicToolError(new CompanionError("Invalid level", "INVALID_LEVEL"))).toEqual({
      code: "INVALID_LEVEL",
      message: "Invalid level",
    });
  });

  it("does not expose unexpected error details", () => {
    expect(publicToolError(new Error("C:\\secret\\profile.db"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "The request could not be completed",
    });
  });
});
