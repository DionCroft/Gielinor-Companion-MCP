import {
  COMPANION_TOOL_DEFINITIONS,
  COMPANION_TOOL_NAMES,
  type CompanionToolName,
} from "@gielinor/shared-types";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ProviderTool } from "./types.js";

function schemaFor(name: CompanionToolName): Record<string, unknown> {
  const schema = zodToJsonSchema(COMPANION_TOOL_DEFINITIONS[name].inputSchema, {
    $refStrategy: "none",
    target: "openApi3",
  });
  return schema as Record<string, unknown>;
}

export const PROVIDER_TOOLS: ProviderTool[] = Object.freeze(
  COMPANION_TOOL_NAMES.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: COMPANION_TOOL_DEFINITIONS[name].description,
      parameters: schemaFor(name),
    },
  })),
) as ProviderTool[];

export function parseToolArguments(
  name: CompanionToolName,
  value: unknown,
): Record<string, unknown> {
  return COMPANION_TOOL_DEFINITIONS[name].inputSchema.parse(value) as Record<string, unknown>;
}
