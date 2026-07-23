import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  CalculateXpRemainingToolInputSchema,
  CreatePlayerProfileToolInputSchema,
  EmptyInputSchema,
  GetItemPriceToolInputSchema,
  GetPlayerStatsToolInputSchema,
  GetSkillProgressToolInputSchema,
  ImportPlayerProfileToolInputSchema,
  ProfileIdInputSchema,
  UpdatePlayerPreferencesToolInputSchema,
} from "./schemas.js";
import { publicToolError, type CompanionToolService, type ToolEnvelope } from "./tool-service.js";

function success(value: ToolEnvelope<unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: { ...value },
  };
}

async function run(operation: () => Promise<ToolEnvelope<unknown>>): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch (error) {
    const result = publicToolError(error);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: result }) }],
      isError: true,
    };
  }
}

export function createCompanionServer(tools: CompanionToolService): McpServer {
  const server = new McpServer(
    { name: "gielinor-companion-mcp", version: "0.1.0" },
    {
      instructions:
        "Use these deterministic, read-only RuneScape 3 data and planning tools. " +
        "Never imply guaranteed Grand Exchange outcomes. Profile mutations affect local companion data only.",
    },
  );

  server.registerTool(
    "create_player_profile",
    {
      description:
        "Create a local-only player profile from a public RuneScape display name. Does not fetch or request account credentials.",
      inputSchema: CreatePlayerProfileToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => run(() => tools.createPlayerProfile(input)),
  );

  server.registerTool(
    "get_player_profile",
    {
      description: "Read a locally stored player profile by its UUID.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.getPlayerProfile(profileId)),
  );

  server.registerTool(
    "list_player_profiles",
    {
      description: "List locally stored player profiles. Returns no credentials.",
      inputSchema: EmptyInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.listPlayerProfiles()),
  );

  server.registerTool(
    "get_player_stats",
    {
      description:
        "Read public RuneScape Hiscores for a display name, using a cache unless forceRefresh is true.",
      inputSchema: GetPlayerStatsToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (input) => run(() => tools.getPlayerStats(input)),
  );

  server.registerTool(
    "refresh_player_stats",
    {
      description:
        "Refresh public Hiscores for a local profile and save the validated skill snapshot locally.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId }) => run(() => tools.refreshPlayerStats(profileId)),
  );

  server.registerTool(
    "update_player_preferences",
    {
      description:
        "Update optional GP budget, daily play time, or planning preference in a local profile.",
      inputSchema: UpdatePlayerPreferencesToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ profileId, ...preferences }) =>
      run(() => tools.updatePlayerPreferences(profileId, preferences)),
  );

  server.registerTool(
    "export_player_profile",
    {
      description:
        "Export a portable schema-versioned profile containing public and manually entered companion data.",
      inputSchema: ProfileIdInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId }) => run(() => tools.exportPlayerProfile(profileId)),
  );

  server.registerTool(
    "import_player_profile",
    {
      description: "Validate and import a schema-versioned profile into local SQLite storage.",
      inputSchema: ImportPlayerProfileToolInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    ({ profile }) => run(() => tools.importPlayerProfile(profile)),
  );

  server.registerTool(
    "calculate_xp_remaining",
    {
      description:
        "Deterministically calculate level, target XP, XP remaining, and progress for levels 1 through 126.",
      inputSchema: CalculateXpRemainingToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ currentExperience, targetLevel }) =>
      Promise.resolve(success(tools.calculateXpRemaining(currentExperience, targetLevel))),
  );

  server.registerTool(
    "get_skill_progress",
    {
      description:
        "Calculate progress for one skill in a refreshed local profile against a target virtual level.",
      inputSchema: GetSkillProgressToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ profileId, skillId, targetLevel }) =>
      run(() => tools.getSkillProgress(profileId, skillId, targetLevel)),
  );

  server.registerTool(
    "get_item_price",
    {
      description:
        "Get the current guide price for an RS3 item ID from Jagex ItemDB, including retrieval and cache timestamps. It is not a guaranteed trade price.",
      inputSchema: GetItemPriceToolInputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    ({ itemId, forceRefresh }) => run(() => tools.getItemPrice(itemId, forceRefresh ?? false)),
  );

  return server;
}
