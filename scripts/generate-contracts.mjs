import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { PROVIDER_TOOLS, PROVIDER_TOOLS_V1_1 } from "../packages/agent-runtime/dist/index.js";
import {
  COMPANION_TOOL_DEFINITIONS,
  CURRENT_COMPANION_TOOL_DEFINITIONS,
  GIELINOR_ERROR_CODES,
  MCP_TOOL_CONTRACT_VERSION,
  MCP_TOOL_CONTRACT_VERSION_V1_1,
  MCP_TOOL_NAMES_V1,
  MCP_TOOL_NAMES_V1_1,
  MCP_TOOL_SCHEMA_STABILITY,
  PROFILE_EXPORT_SCHEMA_VERSION,
} from "../packages/shared-types/dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "data/contracts/mcp-tools-v1.json");
const outputPathV1_1 = resolve(repositoryRoot, "data/contracts/mcp-tools-v1.1.json");

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

const structuredErrorEnvelope = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: [
        "code",
        "category",
        "message",
        "userMessage",
        "severity",
        "retryable",
        "recoverable",
        "timestamp",
        "traceId",
      ],
      properties: {
        code: { type: "string", enum: GIELINOR_ERROR_CODES },
        category: {
          type: "string",
          enum: [
            "configuration",
            "network",
            "provider",
            "validation",
            "cache",
            "database",
            "synchronisation",
            "scheduler",
            "update",
            "mcp",
            "ai-provider",
            "hosted-service",
            "security",
            "unknown",
          ],
        },
        message: { type: "string", minLength: 1, maxLength: 500 },
        userMessage: { type: "string", minLength: 1, maxLength: 500 },
        severity: {
          type: "string",
          enum: ["info", "warning", "error", "critical"],
        },
        retryable: { type: "boolean" },
        recoverable: { type: "boolean" },
        source: { type: "string", minLength: 1, maxLength: 100 },
        operation: { type: "string", minLength: 1, maxLength: 100 },
        timestamp: { type: "string", format: "date-time" },
        traceId: { type: "string", format: "uuid" },
        retryAfterMs: {
          type: "integer",
          minimum: 0,
          maximum: 86_400_000,
        },
        suggestedActions: {
          type: "array",
          maxItems: 10,
          items: { type: "string", minLength: 1, maxLength: 200 },
        },
        causeCode: { type: "string", enum: GIELINOR_ERROR_CODES },
        details: { type: "object" },
        legacyCode: { type: "string", minLength: 1, maxLength: 100 },
        requestId: { type: "string", format: "uuid" },
      },
    },
  },
};

const serialized = `${JSON.stringify(contract, null, 2)}\n`;
const contractV1_1 = {
  ...contract,
  contractVersion: MCP_TOOL_CONTRACT_VERSION_V1_1,
  toolCount: MCP_TOOL_NAMES_V1_1.length,
  errorEnvelope: structuredErrorEnvelope,
  resultEnvelope: {
    ...contract.resultEnvelope,
    properties: {
      ...contract.resultEnvelope.properties,
      meta: {
        ...contract.resultEnvelope.properties.meta,
        properties: {
          ...contract.resultEnvelope.properties.meta.properties,
          traceId: { type: "string", format: "uuid" },
          recoveryStatus: {
            type: "string",
            enum: ["not-required", "not-attempted", "succeeded", "failed", "partial"],
          },
        },
      },
    },
  },
  tools: PROVIDER_TOOLS_V1_1.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    effect: CURRENT_COMPANION_TOOL_DEFINITIONS[tool.function.name].effect,
    inputSchema: tool.function.parameters,
  })),
};
const serializedV1_1 = `${JSON.stringify(contractV1_1, null, 2)}\n`;
const mode = process.argv[2];

if (mode === "--write") {
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, serialized, "utf8"),
    writeFile(outputPathV1_1, serializedV1_1, "utf8"),
  ]);
  process.stdout.write(`Wrote ${outputPath}\nWrote ${outputPathV1_1}\n`);
} else if (mode === "--check") {
  const [current, currentV1_1] = await Promise.all([
    readFile(outputPath, "utf8"),
    readFile(outputPathV1_1, "utf8"),
  ]);
  if (current !== serialized || currentV1_1 !== serializedV1_1) {
    throw new Error(
      "A committed MCP contract manifest is stale. Run corepack pnpm generate:contracts.",
    );
  }
  process.stdout.write("Stable MCP 1.0 and additive MCP 1.1 manifests match their definitions.\n");
} else {
  throw new Error("Use --write or --check");
}
