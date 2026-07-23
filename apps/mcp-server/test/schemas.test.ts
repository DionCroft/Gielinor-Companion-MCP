import { CompanionError } from "@gielinor/core";
import { describe, expect, it } from "vitest";

import {
  CreatePlayerProfileToolInputSchema,
  ImportPlayerProfileToolInputSchema,
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
