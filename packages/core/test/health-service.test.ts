import {
  ComponentHealthSchema,
  ProviderDiagnosticHealthSchema,
  SchedulerHealthSchema,
  type CatalogueHealth,
  type ComponentHealth,
} from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import {
  determineOverallHealth,
  SystemHealthService,
  type SystemHealthSnapshot,
} from "../src/health-service.js";

const NOW = "2026-07-24T12:00:00.000Z";

function component(id: string, state: ComponentHealth["state"] = "healthy"): ComponentHealth {
  return ComponentHealthSchema.parse({ id, state, message: state, checkedAt: NOW });
}

function catalogue(
  catalogueName: CatalogueHealth["catalogue"],
  state: CatalogueHealth["state"] = "fresh",
  recordCount = 1,
): CatalogueHealth {
  return {
    catalogue: catalogueName,
    state,
    recordCount,
    freshnessIntervalMs: 60_000,
    lastSuccessAt: NOW,
  };
}

function snapshot(): SystemHealthSnapshot {
  return {
    database: component("database"),
    providers: [],
    catalogues: [catalogue("quests"), catalogue("training"), catalogue("prices")],
    scheduler: SchedulerHealthSchema.parse({
      state: "healthy",
      enabled: true,
      runningJobs: 0,
      failedJobs: 0,
      jobs: [],
      checkedAt: NOW,
    }),
    updateChecker: component("update-checker", "disabled"),
    activeErrors: [],
    recentRecoveries: [],
    offline: false,
  };
}

describe("system health aggregation", () => {
  it("covers every documented overall state deterministically", () => {
    expect(determineOverallHealth(snapshot())).toBe("healthy");

    const degraded = snapshot();
    degraded.catalogues[0] = catalogue("quests", "stale");
    expect(determineOverallHealth(degraded)).toBe("degraded");

    const recovering = snapshot();
    recovering.scheduler = { ...recovering.scheduler, state: "recovering", runningJobs: 1 };
    expect(determineOverallHealth(recovering)).toBe("recovering");

    const offline = snapshot();
    offline.offline = true;
    expect(determineOverallHealth(offline)).toBe("offline");

    const safeMode = snapshot();
    safeMode.database = component("database", "safe-mode");
    expect(determineOverallHealth(safeMode)).toBe("safe-mode");

    const critical = snapshot();
    critical.catalogues[0] = catalogue("quests", "missing", 0);
    expect(determineOverallHealth(critical)).toBe("critical");
  });

  it("returns one strict central health document", async () => {
    const health = await new SystemHealthService(
      { snapshot: async () => snapshot() },
      () => new Date(NOW),
    ).getHealth();
    expect(health).toMatchObject({
      overall: "healthy",
      checkedAt: NOW,
      database: { state: "healthy" },
    });
    expect(health).not.toHaveProperty("offline");
  });

  it("aggregates provider, update, scheduler, database, catalogue, and optional AI state", () => {
    const provider = ProviderDiagnosticHealthSchema.parse({
      providerId: "provider",
      capability: "player-stats",
      state: "healthy",
      circuitState: "closed",
      successfulRequests: 1,
      failedRequests: 0,
      consecutiveFailures: 0,
      averageLatencyMs: 10,
    });

    const providerFailure = snapshot();
    providerFailure.providers = [{ ...provider, state: "unavailable" }];
    expect(determineOverallHealth(providerFailure)).toBe("degraded");

    const aiFailure = snapshot();
    aiFailure.aiProviders = [{ ...provider, providerId: "ollama", state: "unavailable" }];
    expect(determineOverallHealth(aiFailure)).toBe("degraded");

    const aiRecovery = snapshot();
    aiRecovery.aiProviders = [
      { ...provider, providerId: "lm-studio", state: "degraded", circuitState: "half-open" },
    ];
    expect(determineOverallHealth(aiRecovery)).toBe("recovering");

    const updateFailure = snapshot();
    updateFailure.updateChecker = component("update-checker", "degraded");
    expect(determineOverallHealth(updateFailure)).toBe("degraded");

    const databaseFailure = snapshot();
    databaseFailure.database = component("database", "critical");
    expect(determineOverallHealth(databaseFailure)).toBe("critical");
  });
});
