import { createGielinorError, createTraceId } from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { openDatabase, SqliteDiagnosticsRepository } from "../src/index.js";

describe("persistent redacted diagnostics", () => {
  it("records, resolves, bounds, and validates errors", () => {
    const database = openDatabase(":memory:");
    const diagnostics = new SqliteDiagnosticsRepository(database);
    const error = createGielinorError("GC-SCHED-001", {
      message: "Failed at C:\\private\\player.db token=secret-value",
      source: "scheduler",
      timestamp: "2026-07-24T12:00:00.000Z",
    });
    diagnostics.recordError(error);
    expect(diagnostics.listErrors({ activeOnly: true })[0]).toMatchObject({
      code: "GC-SCHED-001",
      message: expect.not.stringContaining("private"),
    });
    expect(diagnostics.resolveError(error.traceId)).toBe(true);
    expect(diagnostics.listErrors({ activeOnly: true })).toEqual([]);
    expect(diagnostics.listErrors()).toHaveLength(1);
    database.close();
  });

  it("stores only validated and sanitised recovery metadata", () => {
    const database = openDatabase(":memory:");
    const diagnostics = new SqliteDiagnosticsRepository(database);
    diagnostics.recordRecovery({
      eventId: createTraceId(),
      component: "scheduler",
      action: "retry quest catalogue",
      outcome: "succeeded",
      automatic: true,
      occurredAt: "2026-07-24T12:00:00.000Z",
      details: {
        filePath: "C:\\private\\player.db",
        authorization: "Bearer secret",
        attempt: 2,
      },
    });
    expect(diagnostics.listRecoveries()).toEqual([
      expect.objectContaining({
        component: "scheduler",
        outcome: "succeeded",
        details: {
          filePath: "[redacted]",
          authorization: "[redacted]",
          attempt: 2,
        },
      }),
    ]);
    database.close();
  });
});
