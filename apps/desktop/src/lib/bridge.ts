import {
  LocalAiError,
  type JsonTransport,
  type JsonTransportRequest,
  type JsonTransportResponse,
} from "@gielinor/agent-runtime";
import {
  APPLICATION_VERSION,
  DEFAULT_MARKET_PREFERENCES,
  SKILL_IDS,
  type PlayerProfile,
  type ProfileExport,
  type RedactedDiagnostics,
  type SoftwareUpdateCheck,
  type SystemHealth,
} from "@gielinor/shared-types";
import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  CompanionBridge,
  DataStatus,
  PriceItem,
  PriceSummary,
  QuestRoute,
  QuestSummary,
  RuntimeStatus,
  ShoppingList,
  ToolEnvelope,
  TrainingPlan,
  Valuation,
} from "../types.js";

const NOW = "2026-07-23T12:00:00.000Z";

function envelope<T>(data: T, source = "browser preview fixture"): ToolEnvelope<T> {
  return {
    data,
    meta: {
      generatedAt: NOW,
      source,
      provenance: {
        origin: "preview-fixture",
        provider: source,
        timestamp: NOW,
        freshness: "not-applicable",
        cacheState: "not-applicable",
        warnings: ["Preview data is deterministic and is not connected to RuneScape."],
      },
    },
  };
}

function demoProfile(): PlayerProfile {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Demo Adventurer",
    gameMode: "normal",
    availableGp: 2_500_000,
    preferredPlayStyle: "balanced",
    availableHoursPerDay: 2,
    skills: SKILL_IDS.map((skillId, index) => ({
      skillId,
      level: Math.min(99, 42 + (index % 13) * 3),
      experience: 100_000 + index * 48_000,
      rank: 100_000 + index,
    })),
    completedQuestIds: ["cook-s-assistant"],
    inProgressQuestIds: [],
    goals: [],
    lastHiscoresRefresh: NOW,
  };
}

function demoSystemHealth(offline = false, circuitOpen = false): SystemHealth {
  return {
    overall: offline ? "offline" : "healthy",
    database: {
      id: "database",
      state: "healthy",
      message: "SQLite integrity and schema are ready",
      checkedAt: NOW,
      lastSuccessAt: NOW,
    },
    providers: [
      {
        providerId: "gielinor.builtin-public-data",
        capability: "quest-snapshot",
        state: offline ? "unknown" : circuitOpen ? "degraded" : "healthy",
        circuitState: circuitOpen ? "open" : "closed",
        successfulRequests: offline ? 0 : 1,
        failedRequests: circuitOpen ? 3 : 0,
        consecutiveFailures: circuitOpen ? 3 : 0,
        averageLatencyMs: offline ? 0 : 84,
        ...(offline ? {} : { lastSuccessAt: NOW }),
      },
    ],
    catalogues: [
      {
        catalogue: "quests",
        state: offline ? "offline" : "fresh",
        recordCount: 269,
        freshnessIntervalMs: 86_400_000,
        ageMs: 0,
        source: "fixture: RuneScape Wiki quest preview",
        lastSuccessAt: NOW,
        nextRefreshAt: "2026-07-24T12:00:00.000Z",
      },
      {
        catalogue: "training",
        state: offline ? "offline" : "fresh",
        recordCount: 793,
        freshnessIntervalMs: 86_400_000,
        ageMs: 0,
        source: "fixture: RuneScape Wiki training preview",
        lastSuccessAt: NOW,
        nextRefreshAt: "2026-07-24T12:00:00.000Z",
      },
      {
        catalogue: "prices",
        state: offline ? "offline" : "fresh",
        recordCount: 7_310,
        freshnessIntervalMs: 21_600_000,
        ageMs: 0,
        source: "fixture: Grand Exchange preview",
        lastSuccessAt: NOW,
        nextRefreshAt: "2026-07-23T18:00:00.000Z",
      },
    ],
    scheduler: {
      state: offline ? "offline" : "healthy",
      enabled: !offline,
      runningJobs: 0,
      failedJobs: 0,
      jobs: [],
      checkedAt: NOW,
    },
    updateChecker: {
      id: "update-checker",
      state: "disabled",
      message: "Update checks are not connected in this fixture",
      checkedAt: NOW,
    },
    activeErrors: [],
    recentRecoveries: [],
    checkedAt: NOW,
  };
}

const QUESTS: QuestSummary[] = [
  {
    id: "plague-s-end",
    name: "Plague's End",
    members: true,
    difficulty: "Grandmaster",
    length: "Very long",
    questPointReward: 2,
    sourcePageUrl: "https://runescape.wiki/w/Plague%27s_End",
  },
  {
    id: "within-the-light",
    name: "Within the Light",
    members: true,
    difficulty: "Experienced",
    length: "Long",
    questPointReward: 2,
  },
  {
    id: "making-history",
    name: "Making History",
    members: true,
    difficulty: "Intermediate",
    length: "Medium",
    questPointReward: 3,
  },
];

const PRICE_ITEMS: PriceItem[] = [
  {
    itemId: 4151,
    name: "Abyssal whip",
    currentPrice: 83_753,
    buyLimit: 10,
    alchemyValue: 72_000,
    volume: 931,
    timestamp: NOW,
    sourceName: "fixture: Grand Exchange preview",
  },
  {
    itemId: 453,
    name: "Coal",
    currentPrice: 375,
    buyLimit: 25_000,
    alchemyValue: 27,
    volume: 3_200_000,
    timestamp: NOW,
    sourceName: "fixture: Grand Exchange preview",
  },
  {
    itemId: 2,
    name: "Cannonball",
    currentPrice: 2_114,
    buyLimit: 25_000,
    volume: 980_000,
    timestamp: NOW,
    sourceName: "fixture: Grand Exchange preview",
  },
];
const DEFAULT_PRICE_ITEM: PriceItem = PRICE_ITEMS[0]!;

function priceSummary(item: PriceItem): PriceSummary {
  const prices = [78_500, 79_200, 80_100, 79_800, 81_600, 82_200, item.currentPrice ?? 83_000];
  return {
    itemId: item.itemId,
    name: item.name,
    range: "30d",
    ...(item.currentPrice === undefined ? {} : { currentPrice: item.currentPrice }),
    historicalHigh: Math.max(...prices),
    historicalLow: Math.min(...prices),
    percentageChange: 6.69,
    movingAverages: { days7: 80_914, days30: 79_880, days90: 77_230 },
    volatilityPercent: 1.82,
    priceFreshness: { state: "fresh", timestamp: NOW, ageSeconds: 300 },
    historyFreshness: { state: "fresh", timestamp: NOW, ageSeconds: 300 },
    chart: prices.map((price, index) => ({
      timestamp: new Date(
        Date.parse("2026-07-17T00:00:00.000Z") + index * 86_400_000,
      ).toISOString(),
      price,
      averagePrice: 79_000 + index * 400,
    })),
    warnings: [],
    unavailableFields: ["instant buy/high price", "instant sell/low price"],
  };
}

export class TauriCompanionBridge implements CompanionBridge {
  public async runtimeStatus(): Promise<RuntimeStatus> {
    return invoke<RuntimeStatus>("desktop_runtime_status");
  }

  public async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    return invoke<ToolEnvelope<T>>("call_companion_tool", {
      tool,
      arguments: arguments_,
    });
  }

  public localAiTransport(): JsonTransport {
    return new TauriJsonTransport();
  }
}

class TauriJsonTransport implements JsonTransport {
  public async request(request: JsonTransportRequest): Promise<JsonTransportResponse> {
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    if (body !== undefined && new TextEncoder().encode(body).byteLength > 1024 * 1024) {
      throw new LocalAiError(
        "INVALID_CONFIGURATION",
        "The local model request exceeded the one-megabyte safety limit.",
      );
    }
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
      const response = await nativeFetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
        connectTimeout: request.timeoutMs,
        maxRedirections: 0,
      });
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) {
        throw new LocalAiError(
          "PROVIDER_RESPONSE_INVALID",
          "The local model returned an unexpectedly large response.",
        );
      }
      if (text.trim() === "") {
        return { status: response.status, body: null };
      }
      try {
        return { status: response.status, body: JSON.parse(text) as unknown };
      } catch {
        throw new LocalAiError(
          "PROVIDER_RESPONSE_INVALID",
          "The local model returned malformed JSON. Check that its API server is compatible.",
        );
      }
    } catch (error) {
      if (error instanceof LocalAiError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new LocalAiError(
          "TIMEOUT",
          "The local model did not respond before the configured timeout.",
          true,
        );
      }
      throw new LocalAiError(
        "PROVIDER_UNAVAILABLE",
        "The local model server could not be reached. Start it and confirm the endpoint.",
        true,
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

export class DemoCompanionBridge implements CompanionBridge {
  private readonly fixture: string;
  private readonly runtimeMode: "browser-preview" | "automated-test";
  private profiles: PlayerProfile[];

  public constructor(
    fixture = "first-run",
    runtimeMode: "browser-preview" | "automated-test" = "automated-test",
  ) {
    this.fixture = fixture;
    this.runtimeMode = runtimeMode;
    this.profiles = [
      "returning",
      "offline",
      "ai-ready",
      "ai-provider-error",
      "ai-model-error",
      "circuit-open",
    ].includes(fixture)
      ? [demoProfile()]
      : [];
  }

  public async runtimeStatus(): Promise<RuntimeStatus> {
    return {
      ready: true,
      mode: this.runtimeMode,
      message:
        this.fixture === "offline"
          ? "Offline fixture preview: deterministic local test data is available."
          : this.runtimeMode === "automated-test"
            ? "Automated-test mode uses deterministic fixture data."
            : "Browser preview uses deterministic fixture data.",
    };
  }

  private requireProfile(profileId: unknown): PlayerProfile {
    const profile = this.profiles.find((candidate) => candidate.id === profileId);
    if (profile === undefined) {
      throw new Error("Player profile was not found");
    }
    return profile;
  }

  public localAiTransport(): JsonTransport {
    return {
      request: (request) => this.localAiResponse(request),
    };
  }

  private localAiResponse(request: JsonTransportRequest): Promise<JsonTransportResponse> {
    if (this.fixture === "ai-provider-error") {
      return Promise.resolve({ status: 503, body: null });
    }
    if (request.url.endsWith("/api/tags")) {
      return Promise.resolve({
        status: 200,
        body: { models: [{ name: "qwen3:8b" }, { name: "llama3.2:3b" }] },
      });
    }
    if (request.url.endsWith("/api/show")) {
      return Promise.resolve({
        status: 200,
        body: { capabilities: ["completion", "tools"] },
      });
    }
    if (request.url.endsWith("/v1/models")) {
      return Promise.resolve({
        status: 200,
        body: { data: [{ id: "local/qwen3-8b" }, { id: "local/llama-3.2-3b" }] },
      });
    }
    if (this.fixture === "ai-model-error") {
      return Promise.resolve({ status: 404, body: { error: "model not found" } });
    }
    const body = request.body as { messages?: Array<{ role?: string }> } | undefined;
    const hasToolResult = body?.messages?.some((message) => message.role === "tool") ?? false;
    if (request.url.endsWith("/api/chat")) {
      return Promise.resolve(
        hasToolResult
          ? {
              status: 200,
              body: {
                message: {
                  content:
                    "The validated local catalogue lists an Abyssal whip guide price of 83,753 GP.",
                },
                done_reason: "stop",
              },
            }
          : {
              status: 200,
              body: {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      function: {
                        name: "search_items",
                        arguments: { query: "abyssal whip", limit: 5 },
                      },
                    },
                  ],
                },
                done_reason: "tool_calls",
              },
            },
      );
    }
    if (request.url.endsWith("/v1/chat/completions")) {
      return Promise.resolve(
        hasToolResult
          ? {
              status: 200,
              body: {
                choices: [
                  {
                    finish_reason: "stop",
                    message: {
                      content:
                        "The validated local catalogue lists an Abyssal whip guide price of 83,753 GP.",
                    },
                  },
                ],
              },
            }
          : {
              status: 200,
              body: {
                choices: [
                  {
                    finish_reason: "tool_calls",
                    message: {
                      content: null,
                      tool_calls: [
                        {
                          id: "demo-call-1",
                          function: {
                            name: "search_items",
                            arguments: '{"query":"abyssal whip","limit":5}',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
      );
    }
    return Promise.resolve({ status: 404, body: null });
  }

  private providerGuard(tool: string): void {
    if (
      (this.fixture === "provider-error" || this.fixture === "offline") &&
      tool.startsWith("refresh_")
    ) {
      throw new Error(
        this.fixture === "offline"
          ? "You are offline. Retained local data is still available."
          : "The public data provider is temporarily unavailable.",
      );
    }
  }

  public async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    this.providerGuard(tool);
    let result: unknown;
    const source = "browser preview fixture";
    switch (tool) {
      case "list_player_profiles":
        result = this.profiles;
        break;
      case "create_player_profile": {
        const { lastHiscoresRefresh: _lastRefresh, ...profileTemplate } = demoProfile();
        void _lastRefresh;
        const profile = {
          ...profileTemplate,
          id: crypto.randomUUID(),
          displayName: String(arguments_.displayName),
          gameMode: (arguments_.gameMode ?? "normal") as PlayerProfile["gameMode"],
          skills: [],
        };
        this.profiles = [profile, ...this.profiles];
        result = profile;
        break;
      }
      case "get_player_profile":
        result = this.requireProfile(arguments_.profileId);
        break;
      case "refresh_player_stats": {
        const profile = this.requireProfile(arguments_.profileId);
        const skills = demoProfile().skills;
        const refreshed: PlayerProfile = {
          ...profile,
          skills,
          lastHiscoresRefresh: NOW,
        };
        this.profiles = this.profiles.map((candidate) =>
          candidate.id === profile.id ? refreshed : candidate,
        );
        result = refreshed;
        break;
      }
      case "export_player_profile": {
        const profile = this.requireProfile(arguments_.profileId);
        result = {
          schemaVersion: 1,
          displayName: profile.displayName,
          gameMode: profile.gameMode,
          ...(profile.availableGp === undefined ? {} : { availableGp: profile.availableGp }),
          ...(profile.preferredPlayStyle === undefined
            ? {}
            : { preferredPlayStyle: profile.preferredPlayStyle }),
          ...(profile.availableHoursPerDay === undefined
            ? {}
            : { availableHoursPerDay: profile.availableHoursPerDay }),
          completedQuestIds: profile.completedQuestIds,
          inProgressQuestIds: profile.inProgressQuestIds,
          goals: [],
        } satisfies ProfileExport;
        break;
      }
      case "import_player_profile": {
        const imported = arguments_.profile as ProfileExport;
        const { lastHiscoresRefresh: _lastRefresh, ...profileTemplate } = demoProfile();
        void _lastRefresh;
        const profile: PlayerProfile = {
          ...profileTemplate,
          id: crypto.randomUUID(),
          displayName: imported.displayName,
          gameMode: imported.gameMode,
          skills: [],
          completedQuestIds: imported.completedQuestIds,
          inProgressQuestIds: imported.inProgressQuestIds,
          goals: [],
          ...(imported.availableGp === undefined ? {} : { availableGp: imported.availableGp }),
          ...(imported.preferredPlayStyle === undefined
            ? {}
            : { preferredPlayStyle: imported.preferredPlayStyle }),
          ...(imported.availableHoursPerDay === undefined
            ? {}
            : { availableHoursPerDay: imported.availableHoursPerDay }),
        };
        this.profiles = [profile, ...this.profiles];
        result = profile;
        break;
      }
      case "get_skill_progress": {
        const profile = this.requireProfile(arguments_.profileId);
        const skill = profile.skills.find((candidate) => candidate.skillId === arguments_.skillId);
        const currentExperience = skill?.experience ?? 0;
        result = {
          skillId: arguments_.skillId,
          currentExperience,
          currentLevel: skill?.level ?? 1,
          targetLevel: arguments_.targetLevel,
          targetExperience: 13_034_431,
          experienceRemaining: Math.max(0, 13_034_431 - currentExperience),
          progressPercent: Math.min(100, (currentExperience / 13_034_431) * 100),
          hiscoresRefreshedAt: NOW,
        };
        break;
      }
      case "search_quests": {
        const query = String(arguments_.query).toLocaleLowerCase();
        result = QUESTS.filter((quest) => quest.name.toLocaleLowerCase().includes(query));
        break;
      }
      case "create_quest_route":
        this.requireProfile(arguments_.profileId);
        result = {
          targetQuestId: "plague-s-end",
          steps: [
            {
              questId: "making-history",
              name: "Making History",
              status: "not-started",
              depth: 2,
            },
            {
              questId: "within-the-light",
              name: "Within the Light",
              status: "not-started",
              depth: 1,
            },
            {
              questId: "plague-s-end",
              name: "Plague's End",
              status: "not-started",
              depth: 0,
            },
          ],
          alternatives: [],
        } satisfies QuestRoute;
        break;
      case "create_quest_shopping_list":
        this.requireProfile(arguments_.profileId);
        result = {
          targetQuestId: "plague-s-end",
          routeQuestIds: ["making-history", "within-the-light", "plague-s-end"],
          items: [
            {
              itemId: 453,
              name: "Coal",
              quantity: 10,
              alternatives: [],
              requiredByQuestIds: ["making-history"],
            },
            {
              name: "Rope",
              quantity: 2,
              alternatives: [],
              requiredByQuestIds: ["within-the-light"],
            },
          ],
        } satisfies ShoppingList;
        break;
      case "set_quest_status": {
        const profile = this.requireProfile(arguments_.profileId);
        const questId = String(arguments_.quest);
        const completed = profile.completedQuestIds.filter((id) => id !== questId);
        const inProgress = profile.inProgressQuestIds.filter((id) => id !== questId);
        if (arguments_.status === "completed") {
          completed.push(questId);
        } else if (arguments_.status === "in-progress") {
          inProgress.push(questId);
        }
        const updated = {
          ...profile,
          completedQuestIds: completed,
          inProgressQuestIds: inProgress,
        };
        this.profiles = this.profiles.map((candidate) =>
          candidate.id === profile.id ? updated : candidate,
        );
        result = updated;
        break;
      }
      case "create_levelling_plan":
        this.requireProfile(arguments_.profileId);
        result = {
          skillId: String(arguments_.skillId),
          currentLevel: 62,
          targetLevel: Number(arguments_.targetLevel),
          experienceRequired: 4_220_000,
          strategy: String(arguments_.strategy ?? "balanced"),
          totalHoursRange: { minimum: 8.4, maximum: 11.2 },
          totalGpRange: { minimum: 1_150_000, maximum: 1_680_000 },
          completionDateRange: {
            earliest: "2026-07-28T12:00:00.000Z",
            latest: "2026-07-30T12:00:00.000Z",
          },
          feasible: true,
          warnings: ["Rates vary with attention, unlocks, and equipment."],
          assumptions: ["Members' methods are available."],
          stages: [
            {
              startLevel: 62,
              endLevel: 70,
              experience: 880_000,
              method: { id: "fixture-1", name: "Concentrated sandstone", afkRating: "medium" },
              hoursRange: { minimum: 2.1, maximum: 2.8 },
              gpRange: { minimum: 120_000, maximum: 160_000 },
              warnings: [],
            },
            {
              startLevel: 70,
              endLevel: Number(arguments_.targetLevel),
              experience: 3_340_000,
              method: { id: "fixture-2", name: "Seren stones", afkRating: "high" },
              hoursRange: { minimum: 6.3, maximum: 8.4 },
              gpRange: { minimum: 1_030_000, maximum: 1_520_000 },
              warnings: [],
            },
          ],
        } satisfies TrainingPlan;
        break;
      case "search_items": {
        const query = String(arguments_.query).toLocaleLowerCase();
        result = PRICE_ITEMS.filter((item) => item.name.toLocaleLowerCase().includes(query));
        break;
      }
      case "get_item_price_summary": {
        const identifier = arguments_.item;
        const item =
          PRICE_ITEMS.find(
            (candidate) =>
              candidate.itemId === identifier ||
              candidate.name.toLocaleLowerCase() === String(identifier).toLocaleLowerCase(),
          ) ?? DEFAULT_PRICE_ITEM;
        result = priceSummary(item);
        break;
      }
      case "value_item_list": {
        const requested = arguments_.items as Array<{ item: number | string; quantity: number }>;
        const lines = requested.map((line) => {
          const item =
            PRICE_ITEMS.find(
              (candidate) =>
                candidate.itemId === line.item ||
                candidate.name.toLocaleLowerCase() === String(line.item).toLocaleLowerCase(),
            ) ?? DEFAULT_PRICE_ITEM;
          const unitPrice = item.currentPrice ?? 0;
          return {
            itemId: item.itemId,
            name: item.name,
            quantity: line.quantity,
            unitPrice,
            totalPrice: unitPrice * line.quantity,
          };
        });
        result = {
          items: lines,
          totalValue: lines.reduce((total, line) => total + line.totalPrice, 0),
          complete: true,
          warnings: ["Guide-price valuation is informational."],
        } satisfies Valuation;
        break;
      }
      case "get_quest_data_status":
        result = {
          state: "ready",
          provider: "fixture: RuneScape Wiki quest preview",
          lastSuccessfulSyncAt: NOW,
          questCount: 269,
        } satisfies DataStatus;
        break;
      case "get_training_data_status":
        result = {
          state: "ready",
          provider: "fixture: RuneScape Wiki training preview",
          lastSuccessfulSyncAt: NOW,
          methodCount: 793,
          coveredSkills: [...SKILL_IDS],
        } satisfies DataStatus;
        break;
      case "get_price_data_status":
        result = {
          state: "ready",
          provider: "fixture: Grand Exchange preview",
          lastSuccessfulSyncAt: NOW,
          itemCount: 7_310,
          historyPointCount: 180,
        } satisfies DataStatus;
        break;
      case "get_market_data_status":
        result = {
          state: "ready",
          provider: "fixture: Grand Exchange preview",
          lastSuccessfulSyncAt: NOW,
          itemCount: 7_310,
          historyItemCount: 1,
          historyPointCount: 180,
          offline: false,
        };
        break;
      case "get_market_preferences":
        this.requireProfile(arguments_.profileId);
        result = DEFAULT_MARKET_PREFERENCES;
        break;
      case "get_selected_player_snapshot": {
        const selectedProfile = this.profiles[0];
        if (selectedProfile === undefined) throw new Error("Selected player profile was not found");
        result = {
          profile: selectedProfile,
          holdings: null,
          marketPreferences: DEFAULT_MARKET_PREFERENCES,
          selectedAt: NOW,
        };
        break;
      }
      case "get_system_health":
        result = demoSystemHealth(this.fixture === "offline", this.fixture === "circuit-open");
        break;
      case "get_provider_health":
        result = demoSystemHealth(
          this.fixture === "offline",
          this.fixture === "circuit-open",
        ).providers;
        break;
      case "get_catalogue_health":
        result = demoSystemHealth(
          this.fixture === "offline",
          this.fixture === "circuit-open",
        ).catalogues;
        break;
      case "list_recent_errors":
        result = [];
        break;
      case "list_recovery_events":
        result = [];
        break;
      case "run_database_integrity_check":
        result = demoSystemHealth().database;
        break;
      case "export_redacted_diagnostics": {
        const health = demoSystemHealth(
          this.fixture === "offline",
          this.fixture === "circuit-open",
        );
        result = {
          exportVersion: 1,
          generatedAt: NOW,
          application: {
            version: APPLICATION_VERSION,
            operatingSystem: "browser-preview",
            architecture: "browser",
            nodeVersion: "not-applicable",
            databaseSchemaVersion: 6,
            mcpContractVersion: "1.1",
          },
          health,
          configuration: { offline: this.fixture === "offline" },
          recentErrors: [],
          recentRecoveries: [],
          recentLogs: [],
          redactionNotice: "Secrets, credentials, personal identifiers, and paths are excluded.",
        } satisfies RedactedDiagnostics;
        break;
      }
      case "check_for_software_updates":
        result = {
          state: "up-to-date",
          installedVersion: APPLICATION_VERSION,
          checkedAt: NOW,
          nextCheckAt: "2026-07-24T12:00:00.000Z",
          source: "cache",
          message: `Version ${APPLICATION_VERSION} is up to date`,
          checksumMetadataAvailable: true,
          warnings: [],
          traceId: "00000000-0000-4000-8000-000000000021",
          release: {
            version: APPLICATION_VERSION,
            tagName: `v${APPLICATION_VERSION}`,
            name: `Gielinor Companion ${APPLICATION_VERSION}`,
            notes: "One-click launch and live-data completion.",
            publishedAt: NOW,
            releaseUrl: `https://github.com/DionCroft/Gielinor-Companion-MCP/releases/tag/v${APPLICATION_VERSION}`,
            prerelease: false,
            assets: [
              {
                name: `Gielinor-Companion-Setup-${APPLICATION_VERSION}-x64.exe`,
                contentType: "application/vnd.microsoft.portable-executable",
                size: 12_345_678,
                downloadUrl: `https://github.com/DionCroft/Gielinor-Companion-MCP/releases/download/v${APPLICATION_VERSION}/Gielinor-Companion-Setup-${APPLICATION_VERSION}-x64.exe`,
                digest: "sha256:preview-checksum",
              },
            ],
          },
          recommendedAsset: {
            name: `Gielinor-Companion-Setup-${APPLICATION_VERSION}-x64.exe`,
            contentType: "application/vnd.microsoft.portable-executable",
            size: 12_345_678,
            downloadUrl: `https://github.com/DionCroft/Gielinor-Companion-MCP/releases/download/v${APPLICATION_VERSION}/Gielinor-Companion-Setup-${APPLICATION_VERSION}-x64.exe`,
            digest: "sha256:preview-checksum",
          },
        } satisfies SoftwareUpdateCheck;
        break;
      case "clear_expired_quarantine_records":
        result = {
          deleted: 0,
          cutoffAt: "2026-06-24T12:00:00.000Z",
          retentionDays: 30,
        };
        break;
      case "reset_provider_circuit":
        result = {
          providerId: String(arguments_.providerId),
          capability: String(arguments_.capability),
          resetCount: 1,
          state: "closed",
        };
        break;
      case "refresh_quest_data":
        result = { total: 269, inserted: 0, updated: 0, unchanged: 269, removed: 0 };
        break;
      case "refresh_training_data":
        result = { total: 793, inserted: 0, updated: 0, unchanged: 793, removed: 0 };
        break;
      case "refresh_price_data":
        result = {
          catalogue: { total: 7_310, inserted: 0, updated: 0, unchanged: 7_310, removed: 0 },
          histories: [],
        };
        break;
      case "refresh_all_real_data":
        result = {
          limited: false,
          stages: [
            { stage: "player-hiscores", status: "complete" },
            { stage: "quests", status: "complete" },
            { stage: "training", status: "complete" },
            { stage: "grand-exchange", status: "complete" },
          ],
        };
        break;
      case "set_offline_mode":
        result = {
          offline: arguments_["offline"] === true,
          enforcedBy: "preview-fixture",
        };
        break;
      case "set_selected_player_profile":
        result = {
          profileId: String(arguments_["profileId"]),
          selectedAt: NOW,
        };
        break;
      default:
        throw new Error(`The browser preview does not implement ${tool}`);
    }
    return envelope(result as T, source);
  }
}

export class BrowserLiveDevelopmentBridge implements CompanionBridge {
  public async runtimeStatus(): Promise<RuntimeStatus> {
    return {
      ready: false,
      mode: "browser-live-development",
      transport: "unavailable",
      message:
        "Browser live-development is not connected to the local MCP and SQLite runtime. Run `corepack pnpm desktop:dev` for real functionality, or explicitly select browser-preview mode.",
    };
  }

  public async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    void arguments_;
    if (tool === "list_player_profiles") {
      return {
        data: [] as T,
        meta: {
          generatedAt: new Date().toISOString(),
          source: "unavailable: browser live-development has no local MCP connection",
          provenance: {
            origin: "unavailable",
            provider: "browser live-development",
            timestamp: new Date().toISOString(),
            freshness: "unknown",
            cacheState: "not-applicable",
            warnings: ["Use the native desktop runtime for real companion data."],
          },
        },
      };
    }
    throw new Error(
      "Real companion tools are unavailable in a standalone browser. Run `corepack pnpm desktop:dev` to use the native MCP and SQLite bridge.",
    );
  }

  public localAiTransport(): JsonTransport {
    return {
      request: async () => ({
        status: 503,
        body: {
          error:
            "Local AI is unavailable in standalone browser mode; use the native desktop runtime.",
        },
      }),
    };
  }
}

function explicitBrowserMode(): "browser-preview" | "automated-test" | undefined {
  const queryMode = new URLSearchParams(window.location.search).get("mode");
  const requestedMode = queryMode ?? import.meta.env.VITE_GIELINOR_RUNTIME_MODE;
  if (requestedMode === "browser-preview" || requestedMode === "automated-test") {
    return requestedMode;
  }
  return undefined;
}

export function createDefaultBridge(): CompanionBridge {
  if (isTauri()) {
    return new TauriCompanionBridge();
  }
  const mode = explicitBrowserMode();
  if (mode !== undefined) {
    const fixture =
      new URLSearchParams(window.location.search).get("fixture") ??
      import.meta.env.VITE_GIELINOR_FIXTURE ??
      "first-run";
    return new DemoCompanionBridge(fixture, mode);
  }
  return new BrowserLiveDevelopmentBridge();
}
