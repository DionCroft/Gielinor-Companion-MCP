import { CompanionError } from "@gielinor/core";
import { describe, expect, it } from "vitest";

import {
  CreatePlayerProfileToolInputSchema,
  CreateLevellingPlanToolInputSchema,
  ExportPriceDataToolInputSchema,
  ImportPlayerProfileToolInputSchema,
  SetMultipleQuestStatusesToolInputSchema,
  ToolEnvelopeSchema,
  ValueItemListToolInputSchema,
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

  it("bounds Grand Exchange valuations and exports", () => {
    expect(
      ValueItemListToolInputSchema.safeParse({
        items: [{ item: "Abyssal whip", quantity: 2 }],
      }).success,
    ).toBe(true);
    expect(
      ValueItemListToolInputSchema.safeParse({
        items: [{ item: 4151, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      ExportPriceDataToolInputSchema.safeParse({
        items: [4151],
        range: "365d",
        format: "xlsx",
      }).success,
    ).toBe(false);
  });
});

describe("MCP error responses", () => {
  it("returns stable domain errors", () => {
    expect(publicToolError(new CompanionError("Invalid level", "INVALID_LEVEL"))).toMatchObject({
      code: "GC-DATA-001",
      category: "validation",
      message: "Invalid level",
      userMessage: "Invalid level",
      retryable: false,
      recoverable: true,
      legacyCode: "INVALID_LEVEL",
      source: "core",
    });
  });

  it("does not expose unexpected error details", () => {
    const error = publicToolError(new Error("C:\\secret\\profile.db token=do-not-leak"));
    expect(error).toMatchObject({
      code: "GC-MCP-003",
      category: "mcp",
      message: "The request could not be completed",
      userMessage: "The request could not be completed",
      source: "mcp-server",
    });
    expect(error.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(JSON.stringify(error)).not.toMatch(/secret|profile\.db|do-not-leak/i);
  });
});
