import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAINTENANCE_JOBS, type MaintenanceJobName } from "@gielinor/shared-types";

import { openDatabase, PersistentScheduler, SqliteMaintenanceJobRepository } from "../src/index.js";

const START = Date.parse("2026-07-24T10:00:00.000Z");

function harness(
  handlers: Partial<Record<MaintenanceJobName, (signal: AbortSignal) => Promise<void>>>,
  options: {
    now?: () => number;
    ownerId?: string;
    maximumRecoveryAttempts?: number;
  } = {},
) {
  const database = openDatabase(":memory:");
  const repository = new SqliteMaintenanceJobRepository(database);
  const scheduler = new PersistentScheduler(repository, handlers, {
    now: options.now ?? (() => START),
    ownerId: options.ownerId ?? "test-owner",
    leaseDurationMs: 60_000,
    backoffBaseMs: 60_000,
    backoffMaximumMs: 8 * 60_000,
    ...(options.maximumRecoveryAttempts === undefined
      ? {}
      : { maximumRecoveryAttempts: options.maximumRecoveryAttempts }),
    concurrency: 3,
  });
  scheduler.initialize(DEFAULT_MAINTENANCE_JOBS);
  return { database, repository, scheduler };
}

describe("persistent maintenance scheduler", () => {
  it("initializes four persistent jobs without overwriting preferences", () => {
    const { database, repository, scheduler } = harness({});
    expect(repository.list()).toHaveLength(4);
    expect(repository.get("quest-refresh")).toMatchObject({
      enabled: true,
      intervalMs: 24 * 60 * 60_000,
      nextRunAt: "2026-07-24T10:00:00.000Z",
      state: "idle",
    });
    repository.setEnabled("quest-refresh", false, START + 1);
    scheduler.initialize(DEFAULT_MAINTENANCE_JOBS);
    expect(repository.get("quest-refresh")).toMatchObject({
      enabled: false,
      state: "disabled",
    });
    database.close();
  });

  it("runs due jobs independently and reschedules successful work", async () => {
    const calls: string[] = [];
    const { database, repository, scheduler } = harness({
      "quest-refresh": async () => {
        calls.push("quests");
      },
      "training-refresh": async () => {
        calls.push("training");
      },
      "price-refresh": async () => {
        calls.push("prices");
      },
      "software-update-check": async () => {
        calls.push("updates");
      },
    });
    const results = await scheduler.runDue();
    expect(results.every((result) => result.status === "success")).toBe(true);
    expect(calls.sort()).toEqual(["prices", "quests", "training", "updates"]);
    expect(repository.get("quest-refresh")).toMatchObject({
      lastSuccessAt: "2026-07-24T10:00:00.000Z",
      nextRunAt: "2026-07-25T10:00:00.000Z",
      failureCount: 0,
      state: "idle",
    });
    expect(repository.recentAttempts()).toHaveLength(4);
    database.close();
  });

  it("prevents overlapping claims in one or more processes", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { database, repository, scheduler } = harness({
      "quest-refresh": async () => blocked,
    });
    const first = scheduler.runNow("quest-refresh");
    const secondScheduler = new PersistentScheduler(
      repository,
      { "quest-refresh": async () => undefined },
      {
        now: () => START,
        ownerId: "other-process",
        leaseDurationMs: 60_000,
      },
    );
    await expect(secondScheduler.runNow("quest-refresh")).resolves.toMatchObject({
      status: "skipped",
    });
    release?.();
    await expect(first).resolves.toMatchObject({ status: "success" });
    expect(repository.recentAttempts()).toHaveLength(1);
    database.close();
  });

  it("applies bounded exponential backoff and preserves partial success", async () => {
    let now = START;
    const { database, repository, scheduler } = harness(
      {
        "quest-refresh": async () => {
          throw Object.assign(new Error("provider down"), { code: "PROVIDER_UNAVAILABLE" });
        },
        "training-refresh": async () => undefined,
      },
      { now: () => now },
    );
    const first = await scheduler.runDue();
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobName: "quest-refresh",
          status: "failed",
          errorCode: "GC-PROVIDER-001",
        }),
        expect.objectContaining({ jobName: "training-refresh", status: "success" }),
      ]),
    );
    expect(repository.get("quest-refresh")).toMatchObject({
      failureCount: 1,
      nextRunAt: "2026-07-24T10:01:00.000Z",
      state: "backoff",
    });
    now += 60_000;
    await scheduler.runDue();
    expect(repository.get("quest-refresh")).toMatchObject({
      failureCount: 2,
      nextRunAt: "2026-07-24T10:03:00.000Z",
    });
    database.close();
  });

  it("stops automatic recovery after the configured limit and permits a manual retry", async () => {
    let now = START;
    let healthy = false;
    const { database, repository, scheduler } = harness(
      {
        "quest-refresh": async () => {
          if (!healthy) {
            throw Object.assign(new Error("provider remains unavailable"), {
              code: "PROVIDER_UNAVAILABLE",
            });
          }
        },
      },
      { now: () => now, maximumRecoveryAttempts: 2 },
    );

    await scheduler.runDue();
    now += 60_000;
    await scheduler.runDue();
    expect(repository.get("quest-refresh")).toMatchObject({
      state: "failed",
      failureCount: 2,
      lastErrorCode: "GC-SCHED-004",
    });
    now += 10 * 60_000;
    expect(await scheduler.runDue()).not.toContainEqual(
      expect.objectContaining({ jobName: "quest-refresh" }),
    );

    healthy = true;
    await expect(scheduler.runNow("quest-refresh")).resolves.toMatchObject({
      status: "success",
    });
    expect(repository.get("quest-refresh")).toMatchObject({
      state: "idle",
      failureCount: 0,
    });
    database.close();
  });

  it("recovers an expired lease and interrupted attempt after restart", () => {
    const { database, repository } = harness({});
    const claim = repository.claim("quest-refresh", "crashed-process", START, 60_000, true);
    expect(claim).toBeDefined();
    expect(repository.recoverExpiredLeases(START + 60_001, START + 120_001)).toBe(1);
    expect(repository.get("quest-refresh")).toMatchObject({
      state: "backoff",
      failureCount: 1,
      lastErrorCode: "GC-SCHED-002",
      nextRunAt: "2026-07-24T10:02:00.001Z",
    });
    expect(repository.recentAttempts(1)[0]).toMatchObject({
      outcome: "interrupted",
      errorCode: "GC-SCHED-002",
    });
    database.close();
  });

  it("supports first-run due work, enablement, and interval changes", () => {
    const { database, repository } = harness({});
    repository.setEnabled("price-refresh", false, START);
    expect(
      repository.makeDue(["quest-refresh", "training-refresh", "price-refresh"], START + 5),
    ).toBe(2);
    expect(repository.setInterval("quest-refresh", 2 * 60 * 60_000, START + 5)).toBe(true);
    expect(repository.get("quest-refresh")).toMatchObject({
      intervalMs: 2 * 60 * 60_000,
    });
    expect(repository.get("price-refresh")).toMatchObject({ state: "disabled" });
    expect(repository.deferUntil("quest-refresh", START + 10_000, START + 5)).toBe(true);
    expect(repository.get("quest-refresh")).toMatchObject({
      nextRunAt: "2026-07-24T10:00:10.000Z",
    });
    database.close();
  });

  it("aborts active handlers during graceful shutdown", async () => {
    const observed = vi.fn();
    const { database, repository, scheduler } = harness({
      "quest-refresh": (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              observed();
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    });
    const running = scheduler.runNow("quest-refresh");
    await scheduler.stop();
    await expect(running).resolves.toMatchObject({
      status: "failed",
      errorCode: "GC-SYNC-004",
    });
    expect(observed).toHaveBeenCalledOnce();
    expect(repository.recentAttempts(1)[0]).toMatchObject({ outcome: "cancelled" });
    database.close();
  });
});
