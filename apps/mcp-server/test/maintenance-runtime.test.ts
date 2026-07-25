import { openDatabase } from "@gielinor/database";
import { describe, expect, it, vi } from "vitest";

import {
  createCatalogueMaintenanceRuntime,
  loadMaintenanceRuntimePolicy,
} from "../src/maintenance-runtime.js";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

function service(status: Record<string, unknown>) {
  return {
    getDataStatus: vi.fn(async () => status),
    refreshData: vi.fn(async () => undefined),
  };
}

describe("catalogue maintenance runtime", () => {
  it("loads bounded configurable refresh defaults", () => {
    expect(loadMaintenanceRuntimePolicy({})).toEqual({
      automaticRefreshEnabled: true,
      refreshOnStartup: true,
      backgroundRefresh: true,
      concurrency: 3,
      maximumRecoveryAttempts: 5,
      intervals: {
        "quest-refresh": 86_400_000,
        "training-refresh": 86_400_000,
        "price-refresh": 21_600_000,
        "software-update-check": 86_400_000,
      },
    });
    expect(
      loadMaintenanceRuntimePolicy({
        GIELINOR_MAINTENANCE_ENABLED: "false",
        GIELINOR_REFRESH_ON_STARTUP: "off",
        GIELINOR_BACKGROUND_REFRESH: "no",
        GIELINOR_MAINTENANCE_CONCURRENCY: "2",
        GIELINOR_MAINTENANCE_MAX_RECOVERY_ATTEMPTS: "4",
        GIELINOR_QUEST_REFRESH_MS: "3600000",
      }),
    ).toMatchObject({
      automaticRefreshEnabled: false,
      refreshOnStartup: false,
      backgroundRefresh: false,
      concurrency: 2,
      maximumRecoveryAttempts: 4,
      intervals: { "quest-refresh": 3_600_000 },
    });
    expect(() =>
      loadMaintenanceRuntimePolicy({ GIELINOR_MAINTENANCE_CONCURRENCY: "999" }),
    ).toThrow();
  });

  it("runs missing catalogues independently and defers fresh catalogues", async () => {
    const database = openDatabase(":memory:");
    const quests = service({ state: "never-synced", questCount: 0 });
    const training = service({
      state: "ready",
      methodCount: 10,
      coveredSkills: [],
      lastSuccessfulSyncAt: "2026-07-24T11:30:00.000Z",
    });
    const prices = service({
      state: "never-synced",
      itemCount: 0,
      historyItemCount: 0,
      historyPointCount: 0,
    });
    const runtime = await createCatalogueMaintenanceRuntime({
      database,
      quests: quests as never,
      planner: training as never,
      exchange: prices as never,
      now: () => NOW,
    });
    const results = await runtime.runDue();
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobName: "quest-refresh", status: "success" }),
        expect.objectContaining({ jobName: "price-refresh", status: "success" }),
      ]),
    );
    expect(quests.refreshData).toHaveBeenCalledOnce();
    expect(prices.refreshData).toHaveBeenCalledOnce();
    expect(training.refreshData).not.toHaveBeenCalled();
    expect(runtime.repository.get("training-refresh")?.nextRunAt).toBe("2026-07-25T11:30:00.000Z");
    await runtime.stop();
    database.close();
  });

  it("runs the read-only software update check as its own persistent job", async () => {
    const database = openDatabase(":memory:");
    const readyAt = "2026-07-24T11:30:00.000Z";
    const updateChecker = {
      enabled: true,
      check: vi.fn(async () => ({
        state: "up-to-date",
        installedVersion: "1.1.0",
        checkedAt: new Date(NOW).toISOString(),
        source: "live",
        message: "Version 1.1.0 is up to date",
        warnings: [],
        traceId: "00000000-0000-4000-8000-000000000031",
      })),
    };
    const runtime = await createCatalogueMaintenanceRuntime({
      database,
      quests: service({ state: "ready", questCount: 1, lastSuccessfulSyncAt: readyAt }) as never,
      planner: service({
        state: "ready",
        methodCount: 1,
        coveredSkills: [],
        lastSuccessfulSyncAt: readyAt,
      }) as never,
      exchange: service({
        state: "ready",
        itemCount: 1,
        historyItemCount: 0,
        historyPointCount: 0,
        lastSuccessfulSyncAt: readyAt,
      }) as never,
      updateChecker: updateChecker as never,
      now: () => NOW,
    });
    await expect(runtime.runDue()).resolves.toContainEqual({
      status: "success",
      jobName: "software-update-check",
    });
    expect(updateChecker.check).toHaveBeenCalledWith({ forceRefresh: true });
    expect(runtime.repository.get("software-update-check")).toMatchObject({
      enabled: true,
      state: "idle",
    });
    await runtime.stop();
    database.close();
  });
});
