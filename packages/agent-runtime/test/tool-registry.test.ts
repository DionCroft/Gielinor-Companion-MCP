import { COMPANION_TOOL_NAMES } from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { parseToolArguments, PROVIDER_TOOLS } from "../src/index.js";

describe("shared companion tool registry", () => {
  it("generates provider schemas for the same 48 trusted tools as MCP", () => {
    expect(PROVIDER_TOOLS).toHaveLength(48);
    expect(PROVIDER_TOOLS.map((tool) => tool.function.name)).toEqual(COMPANION_TOOL_NAMES);
    for (const tool of PROVIDER_TOOLS) {
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect(tool.function.parameters).toMatchObject({ type: "object" });
    }
  });

  it("validates arguments with the shared Zod schema before execution", () => {
    expect(
      parseToolArguments("calculate_xp_remaining", {
        currentExperience: 0,
        targetLevel: 10,
        skillId: "mining",
      }),
    ).toEqual({
      currentExperience: 0,
      targetLevel: 10,
      skillId: "mining",
    });
    expect(() =>
      parseToolArguments("calculate_xp_remaining", {
        currentExperience: -1,
        targetLevel: 10,
      }),
    ).toThrow();
  });
});
