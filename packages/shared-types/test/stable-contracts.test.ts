import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMPANION_TOOL_DEFINITIONS,
  COMPANION_TOOL_NAMES,
  ImportableProfileExportSchema,
  MCP_TOOL_CONTRACT_VERSION,
  MCP_TOOL_NAMES_V1,
  MCP_TOOL_SCHEMA_STABILITY,
  PROFILE_EXPORT_SCHEMA_VERSION,
  ProfileExportSchema,
  ToolEnvelopeSchema,
} from "../src/index.js";

describe("Version 1 stable public contracts", () => {
  it("freezes the exact 48-tool name and input-schema surface", () => {
    expect(MCP_TOOL_CONTRACT_VERSION).toBe("1.0");
    expect(MCP_TOOL_SCHEMA_STABILITY).toBe("stable");
    expect(Object.isFrozen(MCP_TOOL_NAMES_V1)).toBe(true);
    expect(COMPANION_TOOL_NAMES).toEqual(MCP_TOOL_NAMES_V1);
    expect(COMPANION_TOOL_NAMES).toHaveLength(48);
    expect(Object.keys(COMPANION_TOOL_DEFINITIONS)).toEqual(MCP_TOOL_NAMES_V1);

    for (const definition of Object.values(COMPANION_TOOL_DEFINITIONS)) {
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.effect === "read-only" || definition.effect === "local-state").toBe(true);
      expect(definition.inputSchema.safeParse({ unexpectedStableField: true }).success).toBe(false);
    }
  });

  it("keeps the common structured result envelope stable", () => {
    expect(
      ToolEnvelopeSchema.parse({
        data: { value: 1 },
        meta: {
          generatedAt: "2026-07-24T00:00:00.000Z",
          source: "stable fixture",
        },
      }),
    ).toEqual({
      data: { value: 1 },
      meta: {
        generatedAt: "2026-07-24T00:00:00.000Z",
        source: "stable fixture",
      },
    });
  });

  it("keeps profile export v1 stable and legacy v0 importable", () => {
    const current = {
      schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
      displayName: "Stable Hero",
      gameMode: "normal",
      completedQuestIds: ["cook-assistant"],
      inProgressQuestIds: [],
      goals: [],
    };
    expect(ProfileExportSchema.parse(current)).toEqual(current);
    expect(
      ImportableProfileExportSchema.parse({
        schemaVersion: 0,
        displayName: "Legacy Hero",
      }),
    ).toMatchObject({ schemaVersion: 0 });

    const published = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/schemas/profile-export.schema.json"), "utf8"),
    ) as { properties: { schemaVersion: { const: number } } };
    expect(published.properties.schemaVersion.const).toBe(PROFILE_EXPORT_SCHEMA_VERSION);
  });

  it("publishes a generated manifest matching the runtime order", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/contracts/mcp-tools-v1.json"), "utf8"),
    ) as {
      contractVersion: string;
      stability: string;
      toolCount: number;
      tools: Array<{ name: string }>;
    };
    expect(manifest).toMatchObject({
      contractVersion: "1.0",
      stability: "stable",
      toolCount: 48,
    });
    expect(manifest.tools.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES_V1);
  });
});
