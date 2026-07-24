import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { PROVIDER_TOOLS } from "../packages/agent-runtime/dist/index.js";
import {
  COMPANION_TOOL_DEFINITIONS,
  MCP_TOOL_CONTRACT_VERSION,
  MCP_TOOL_NAMES_V1,
  MCP_TOOL_SCHEMA_STABILITY,
  PROFILE_EXPORT_SCHEMA_VERSION,
} from "../packages/shared-types/dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "data/contracts/mcp-tools-v1.json");

const contract = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  contractVersion: MCP_TOOL_CONTRACT_VERSION,
  stability: MCP_TOOL_SCHEMA_STABILITY,
  profileExportSchemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
  toolCount: MCP_TOOL_NAMES_V1.length,
  resultEnvelope: {
    type: "object",
    additionalProperties: false,
    required: ["data", "meta"],
    properties: {
      data: {},
      meta: {
        type: "object",
        additionalProperties: false,
        required: ["generatedAt", "source"],
        properties: {
          generatedAt: { type: "string", format: "date-time" },
          source: { type: "string", minLength: 1 },
        },
      },
    },
  },
  errorEnvelope: {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1 },
        },
      },
    },
  },
  tools: PROVIDER_TOOLS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    effect: COMPANION_TOOL_DEFINITIONS[tool.function.name].effect,
    inputSchema: tool.function.parameters,
  })),
};

const serialized = `${JSON.stringify(contract, null, 2)}\n`;
const mode = process.argv[2];

if (mode === "--write") {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
} else if (mode === "--check") {
  const current = await readFile(outputPath, "utf8");
  if (current !== serialized) {
    throw new Error(
      "The committed MCP contract manifest is stale. Run corepack pnpm generate:contracts.",
    );
  }
  process.stdout.write("Stable MCP contract manifest matches the runtime definitions.\n");
} else {
  throw new Error("Use --write or --check");
}
