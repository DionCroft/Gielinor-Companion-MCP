import { describe, expect, it } from "vitest";

import {
  ImportableProfileExportSchema,
  MCP_TOOL_NAMES_V1,
  PROFILE_EXPORT_SCHEMA_VERSION,
  ProfileExportSchema,
} from "../src/index.js";
import { COMPANION_TOOL_DEFINITIONS } from "../src/tool-definitions.js";

describe("Version 1 public schema compatibility", () => {
  it("preserves the complete MCP tool-name contract", () => {
    expect(Object.keys(COMPANION_TOOL_DEFINITIONS)).toEqual(MCP_TOOL_NAMES_V1);
    for (const definition of Object.values(COMPANION_TOOL_DEFINITIONS)) {
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.inputSchema.safeParse({})).toHaveProperty("success");
    }
  });

  it("keeps profile export version 1 valid while accepting the documented migration input", () => {
    const current = {
      schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
      displayName: "SchemaTest",
      gameMode: "normal",
      completedQuestIds: [],
      inProgressQuestIds: [],
      goals: [],
    };
    expect(ProfileExportSchema.parse(current)).toEqual(current);
    expect(
      ImportableProfileExportSchema.parse({
        schemaVersion: 0,
        displayName: "Legacy",
      }),
    ).toMatchObject({ schemaVersion: 0 });
  });
});
