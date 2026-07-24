import type {
  GrandExchangeDataProvider,
  PlayerStatsProvider,
  ProviderRequestOptions,
  QuestDataProvider,
  TrainingMethodProvider,
} from "@gielinor/core";
import {
  GrandExchangeItemSchema,
  PlayerStatsResultSchema,
  PriceDataSnapshotSchema,
  PricePointSchema,
  QuestDataSnapshotSchema,
  TrainingDataSnapshotSchema,
  type GameMode,
  type GrandExchangeItem,
  type PlayerStatsResult,
  type PriceDataSnapshot,
  type PriceHistoryRange,
  type PricePoint,
  type QuestDataSnapshot,
  type TrainingDataSnapshot,
} from "@gielinor/shared-types";
import { z } from "zod";

import { ProviderError } from "./http.js";

export const PROVIDER_CAPABILITIES = [
  "player-stats",
  "current-price",
  "price-history",
  "price-snapshot",
  "quest-snapshot",
  "training-snapshot",
] as const;

export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];
export type ProviderOfflineSupport = "none" | "cache" | "full";

export type ProviderCapabilityRequestMap = {
  "player-stats": { displayName: string; gameMode: GameMode };
  "current-price": { itemId: number };
  "price-history": { itemId: number; range: PriceHistoryRange };
  "price-snapshot": Record<string, never>;
  "quest-snapshot": Record<string, never>;
  "training-snapshot": Record<string, never>;
};

export type ProviderCapabilityResultMap = {
  "player-stats": PlayerStatsResult;
  "current-price": GrandExchangeItem;
  "price-history": PricePoint[];
  "price-snapshot": PriceDataSnapshot;
  "quest-snapshot": QuestDataSnapshot;
  "training-snapshot": TrainingDataSnapshot;
};

export type ProviderExecutionContext = {
  forceRefresh: boolean;
  offline: boolean;
};

export type ProviderCapabilityRegistration<K extends ProviderCapability> = {
  capability: K;
  priority: number;
  offlineSupport: ProviderOfflineSupport;
  description: string;
  handler(
    request: ProviderCapabilityRequestMap[K],
    context: ProviderExecutionContext,
  ): Promise<ProviderCapabilityResultMap[K]>;
};

export type AnyProviderCapabilityRegistration = {
  [K in ProviderCapability]: ProviderCapabilityRegistration<K>;
}[ProviderCapability];

export type ProviderPlugin = {
  id: string;
  name: string;
  version: string;
  capabilities: readonly AnyProviderCapabilityRegistration[];
};

export type ProviderCapabilityMetadata = {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  capability: ProviderCapability;
  priority: number;
  offlineSupport: ProviderOfflineSupport;
  description: string;
};

export type ProviderHealthState = "unknown" | "healthy" | "degraded" | "unavailable";

export type ProviderHealth = {
  pluginId: string;
  capability: ProviderCapability;
  state: ProviderHealthState;
  successfulRequests: number;
  failedRequests: number;
  consecutiveFailures: number;
  averageLatencyMs: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastErrorCode?: string;
};

type MutableProviderHealth = Omit<ProviderHealth, "state" | "averageLatencyMs"> & {
  totalLatencyMs: number;
};

export class ProviderHealthTracker {
  private readonly health = new Map<string, MutableProviderHealth>();

  public track(pluginId: string, capability: ProviderCapability): void {
    this.entry(pluginId, capability);
  }

  public success(pluginId: string, capability: ProviderCapability, latencyMs: number): void {
    const entry = this.entry(pluginId, capability);
    entry.successfulRequests += 1;
    entry.consecutiveFailures = 0;
    entry.totalLatencyMs += latencyMs;
    entry.lastSuccessAt = new Date().toISOString();
    delete entry.lastErrorCode;
  }

  public failure(
    pluginId: string,
    capability: ProviderCapability,
    latencyMs: number,
    error: unknown,
  ): void {
    const entry = this.entry(pluginId, capability);
    entry.failedRequests += 1;
    entry.consecutiveFailures += 1;
    entry.totalLatencyMs += latencyMs;
    entry.lastFailureAt = new Date().toISOString();
    entry.lastErrorCode =
      error instanceof ProviderError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_PROVIDER_RESULT"
          : "PROVIDER_FAILURE";
  }

  public snapshot(): ProviderHealth[] {
    return [...this.health.values()]
      .map((entry): ProviderHealth => {
        const requests = entry.successfulRequests + entry.failedRequests;
        return {
          pluginId: entry.pluginId,
          capability: entry.capability,
          state:
            requests === 0
              ? "unknown"
              : entry.consecutiveFailures === 0
                ? "healthy"
                : entry.consecutiveFailures < 3
                  ? "degraded"
                  : "unavailable",
          successfulRequests: entry.successfulRequests,
          failedRequests: entry.failedRequests,
          consecutiveFailures: entry.consecutiveFailures,
          averageLatencyMs: requests === 0 ? 0 : entry.totalLatencyMs / requests,
          ...(entry.lastSuccessAt === undefined ? {} : { lastSuccessAt: entry.lastSuccessAt }),
          ...(entry.lastFailureAt === undefined ? {} : { lastFailureAt: entry.lastFailureAt }),
          ...(entry.lastErrorCode === undefined ? {} : { lastErrorCode: entry.lastErrorCode }),
        };
      })
      .sort(
        (left, right) =>
          left.pluginId.localeCompare(right.pluginId) ||
          left.capability.localeCompare(right.capability),
      );
  }

  private entry(pluginId: string, capability: ProviderCapability): MutableProviderHealth {
    const key = `${pluginId}:${capability}`;
    let entry = this.health.get(key);
    if (entry === undefined) {
      entry = {
        pluginId,
        capability,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveFailures: 0,
        totalLatencyMs: 0,
      };
      this.health.set(key, entry);
    }
    return entry;
  }
}

type RegisteredCapability = {
  metadata: ProviderCapabilityMetadata;
  handler(request: unknown, context: ProviderExecutionContext): Promise<unknown>;
};

export type ProviderAttempt<TResult> =
  | {
      pluginId: string;
      outcome: "success";
      durationMs: number;
      value: TResult;
    }
  | {
      pluginId: string;
      outcome: "failure";
      durationMs: number;
      errorCode: string;
      message: string;
    };

export type ProviderDisagreement<TResult> = {
  selectedPluginId: string;
  comparedPluginId: string;
  selectedValue: TResult;
  comparedValue: TResult;
};

export type ProviderRouteResult<TResult> = {
  value: TResult;
  selectedPluginId: string;
  attempts: ProviderAttempt<TResult>[];
  disagreements: ProviderDisagreement<TResult>[];
};

export type ProviderRouteOptions = {
  forceRefresh?: boolean;
  offline?: boolean;
  compareAll?: boolean;
  equivalent?: (left: unknown, right: unknown) => boolean;
};

function errorDetails(error: unknown): { errorCode: string; message: string } {
  if (error instanceof ProviderError) {
    return { errorCode: error.code, message: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      errorCode: "INVALID_PROVIDER_RESULT",
      message: "Provider returned data that does not satisfy the capability contract",
    };
  }
  return { errorCode: "PROVIDER_FAILURE", message: "Provider capability execution failed" };
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(comparable).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${comparable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateResult<K extends ProviderCapability>(
  capability: K,
  value: unknown,
): ProviderCapabilityResultMap[K] {
  switch (capability) {
    case "player-stats":
      return PlayerStatsResultSchema.parse(value) as ProviderCapabilityResultMap[K];
    case "current-price":
      return GrandExchangeItemSchema.parse(value) as ProviderCapabilityResultMap[K];
    case "price-history":
      return z.array(PricePointSchema).parse(value) as ProviderCapabilityResultMap[K];
    case "price-snapshot":
      return PriceDataSnapshotSchema.parse(value) as ProviderCapabilityResultMap[K];
    case "quest-snapshot":
      return QuestDataSnapshotSchema.parse(value) as ProviderCapabilityResultMap[K];
    case "training-snapshot":
      return TrainingDataSnapshotSchema.parse(value) as ProviderCapabilityResultMap[K];
  }
}

export class ProviderRegistry {
  private readonly registrations = new Map<ProviderCapability, RegisteredCapability[]>();
  private readonly pluginIds = new Set<string>();

  public constructor(public readonly health = new ProviderHealthTracker()) {}

  public register(plugin: ProviderPlugin): void {
    if (!/^[a-z0-9][a-z0-9.-]{1,99}$/.test(plugin.id)) {
      throw new ProviderError("Provider plugin ID is invalid", "INVALID_PROVIDER_PLUGIN", false);
    }
    if (this.pluginIds.has(plugin.id)) {
      throw new ProviderError(
        `Provider plugin ${plugin.id} is already registered`,
        "DUPLICATE_PROVIDER_PLUGIN",
        false,
      );
    }
    if (
      typeof plugin.name !== "string" ||
      plugin.name.trim().length === 0 ||
      typeof plugin.version !== "string" ||
      plugin.version.trim().length === 0
    ) {
      throw new ProviderError(
        "Provider plugin name and version are required",
        "INVALID_PROVIDER_PLUGIN",
        false,
      );
    }
    if (plugin.capabilities.length === 0) {
      throw new ProviderError(
        "Provider plugin must declare at least one capability",
        "EMPTY_PROVIDER_PLUGIN",
        false,
      );
    }
    const seen = new Set<ProviderCapability>();
    const prepared: RegisteredCapability[] = [];
    for (const registration of plugin.capabilities) {
      if (!PROVIDER_CAPABILITIES.includes(registration.capability)) {
        throw new ProviderError(
          "Provider capability is not supported",
          "INVALID_PROVIDER_CAPABILITY",
          false,
        );
      }
      if (seen.has(registration.capability)) {
        throw new ProviderError(
          `Provider plugin ${plugin.id} declares ${registration.capability} more than once`,
          "DUPLICATE_PROVIDER_CAPABILITY",
          false,
        );
      }
      seen.add(registration.capability);
      if (!Number.isSafeInteger(registration.priority)) {
        throw new ProviderError(
          "Provider priority must be a safe integer",
          "INVALID_PROVIDER_PRIORITY",
          false,
        );
      }
      if (
        !["none", "cache", "full"].includes(registration.offlineSupport) ||
        typeof registration.description !== "string" ||
        registration.description.trim().length === 0 ||
        typeof registration.handler !== "function"
      ) {
        throw new ProviderError(
          `Provider capability ${registration.capability} has invalid metadata`,
          "INVALID_PROVIDER_CAPABILITY",
          false,
        );
      }
      const registered: RegisteredCapability = {
        metadata: {
          pluginId: plugin.id,
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          capability: registration.capability,
          priority: registration.priority,
          offlineSupport: registration.offlineSupport,
          description: registration.description,
        },
        handler: (request, context) =>
          (
            registration.handler as (
              request: unknown,
              context: ProviderExecutionContext,
            ) => Promise<unknown>
          )(request, context),
      };
      prepared.push(registered);
    }

    for (const registered of prepared) {
      this.health.track(plugin.id, registered.metadata.capability);
      const registrations = this.registrations.get(registered.metadata.capability) ?? [];
      registrations.push(registered);
      registrations.sort(
        (left, right) =>
          right.metadata.priority - left.metadata.priority ||
          left.metadata.pluginId.localeCompare(right.metadata.pluginId),
      );
      this.registrations.set(registered.metadata.capability, registrations);
    }
    this.pluginIds.add(plugin.id);
  }

  public capabilities(): ProviderCapabilityMetadata[] {
    return [...this.registrations.values()]
      .flat()
      .map((registration) => registration.metadata)
      .sort(
        (left, right) =>
          left.capability.localeCompare(right.capability) ||
          right.priority - left.priority ||
          left.pluginId.localeCompare(right.pluginId),
      );
  }

  public async execute<K extends ProviderCapability>(
    capability: K,
    request: ProviderCapabilityRequestMap[K],
    options: ProviderRouteOptions = {},
  ): Promise<ProviderRouteResult<ProviderCapabilityResultMap[K]>> {
    const offline = options.offline ?? false;
    const candidates = (this.registrations.get(capability) ?? []).filter(
      (registration) => !offline || registration.metadata.offlineSupport !== "none",
    );
    if (candidates.length === 0) {
      throw new ProviderError(
        offline
          ? `No offline provider is available for ${capability}`
          : `No provider is registered for ${capability}`,
        offline ? "OFFLINE_CAPABILITY_UNAVAILABLE" : "PROVIDER_CAPABILITY_UNAVAILABLE",
        false,
      );
    }

    const context: ProviderExecutionContext = {
      forceRefresh: options.forceRefresh ?? false,
      offline,
    };
    const attempts: ProviderAttempt<ProviderCapabilityResultMap[K]>[] = [];
    const successes: Array<{ pluginId: string; value: ProviderCapabilityResultMap[K] }> = [];

    for (const candidate of candidates) {
      const startedAt = performance.now();
      try {
        const value = validateResult(capability, await candidate.handler(request, context));
        const durationMs = performance.now() - startedAt;
        this.health.success(candidate.metadata.pluginId, capability, durationMs);
        attempts.push({
          pluginId: candidate.metadata.pluginId,
          outcome: "success",
          durationMs,
          value,
        });
        successes.push({ pluginId: candidate.metadata.pluginId, value });
        if (!(options.compareAll ?? false)) {
          break;
        }
      } catch (error) {
        const durationMs = performance.now() - startedAt;
        this.health.failure(candidate.metadata.pluginId, capability, durationMs, error);
        attempts.push({
          pluginId: candidate.metadata.pluginId,
          outcome: "failure",
          durationMs,
          ...errorDetails(error),
        });
      }
    }

    const selected = successes[0];
    if (selected === undefined) {
      const failures = attempts
        .filter((attempt) => attempt.outcome === "failure")
        .map((attempt) => new Error(`${attempt.pluginId}: ${attempt.message}`));
      throw new ProviderError(
        `Every provider failed for ${capability}`,
        "ALL_PROVIDERS_FAILED",
        true,
        { cause: new AggregateError(failures) },
      );
    }

    const equivalent =
      options.equivalent ??
      ((left: unknown, right: unknown) => comparable(left) === comparable(right));
    const disagreements = successes
      .slice(1)
      .filter((candidate) => !equivalent(selected.value, candidate.value))
      .map((candidate): ProviderDisagreement<ProviderCapabilityResultMap[K]> => ({
        selectedPluginId: selected.pluginId,
        comparedPluginId: candidate.pluginId,
        selectedValue: selected.value,
        comparedValue: candidate.value,
      }));
    return {
      value: selected.value,
      selectedPluginId: selected.pluginId,
      attempts,
      disagreements,
    };
  }
}

export class ProviderPortAdapter implements PlayerStatsProvider, GrandExchangeDataProvider {
  public readonly quests: QuestDataProvider;
  public readonly training: TrainingMethodProvider;

  public constructor(
    public readonly registry: ProviderRegistry,
    private readonly offline = false,
  ) {
    this.quests = {
      fetchSnapshot: async () =>
        (await this.registry.execute("quest-snapshot", {}, { offline: this.offline })).value,
    };
    this.training = {
      fetchSnapshot: async () =>
        (await this.registry.execute("training-snapshot", {}, { offline: this.offline })).value,
    };
  }

  public async getPlayerStats(
    displayName: string,
    gameMode: GameMode = "normal",
    options: ProviderRequestOptions = {},
  ): Promise<PlayerStatsResult> {
    return (
      await this.registry.execute("player-stats", { displayName, gameMode }, this.options(options))
    ).value;
  }

  public async getCurrentPrice(
    itemId: number,
    options: ProviderRequestOptions = {},
  ): Promise<GrandExchangeItem> {
    return (await this.registry.execute("current-price", { itemId }, this.options(options))).value;
  }

  public async getPriceHistory(
    itemId: number,
    range: PriceHistoryRange,
    options: ProviderRequestOptions = {},
  ): Promise<PricePoint[]> {
    return (await this.registry.execute("price-history", { itemId, range }, this.options(options)))
      .value;
  }

  public async fetchSnapshot(): Promise<PriceDataSnapshot> {
    return (await this.registry.execute("price-snapshot", {}, { offline: this.offline })).value;
  }

  private options(options: ProviderRequestOptions): ProviderRouteOptions {
    return {
      forceRefresh: options.forceRefresh ?? false,
      offline: this.offline || (options.offline ?? false),
    };
  }
}
