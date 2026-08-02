import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CURRENT_COMPANION_TOOL_DEFINITIONS,
  CURRENT_COMPANION_TOOL_NAMES,
  MCP_TOOL_CONTRACT_VERSION_V1_1,
  MCP_TOOL_NAMES_V1,
  MCP_TOOL_NAMES_V1_1,
} from "../src/index.js";

describe("Version 1.1 additive MCP contract", () => {
  it("preserves all 48 Version 1.0 tools and appends strict Version 1.1 tools", () => {
    expect(MCP_TOOL_CONTRACT_VERSION_V1_1).toBe("1.1");
    expect(MCP_TOOL_NAMES_V1_1.slice(0, MCP_TOOL_NAMES_V1.length)).toEqual(MCP_TOOL_NAMES_V1);
    expect(MCP_TOOL_NAMES_V1_1.length).toBeGreaterThan(MCP_TOOL_NAMES_V1.length);
    expect(CURRENT_COMPANION_TOOL_NAMES).toEqual(MCP_TOOL_NAMES_V1_1);
    expect(Object.keys(CURRENT_COMPANION_TOOL_DEFINITIONS)).toEqual(MCP_TOOL_NAMES_V1_1);
    for (const name of MCP_TOOL_NAMES_V1_1.slice(MCP_TOOL_NAMES_V1.length)) {
      const definition = CURRENT_COMPANION_TOOL_DEFINITIONS[name];
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.inputSchema.safeParse({ unexpectedField: true }).success).toBe(false);
    }
  });

  it("publishes the exact generated 1.1 manifest", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/contracts/mcp-tools-v1.1.json"), "utf8"),
    ) as {
      contractVersion: string;
      toolCount: number;
      tools: Array<{ name: string }>;
    };
    expect(manifest.contractVersion).toBe("1.1");
    expect(manifest.toolCount).toBe(MCP_TOOL_NAMES_V1_1.length);
    expect(manifest.tools.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES_V1_1);
  });
});
