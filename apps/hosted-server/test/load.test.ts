import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { HostedConfig } from "../src/config.js";
import { createHostedHttpServer } from "../src/http-server.js";

function loadConfig(directory: string): HostedConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    publicDatabasePath: join(directory, "public.db"),
    controlDatabasePath: join(directory, "control.db"),
    accountDirectory: join(directory, "accounts"),
    accountCreationEnabled: false,
    allowedOrigins: new Set(),
    allowedHosts: new Set(["127.0.0.1"]),
    trustProxy: false,
    requireHttps: false,
    maxRequestBytes: 16_384,
    maxBatchMessages: 4,
    requestsPerMinute: 10_000,
    toolCallsPerMinute: 10_000,
    requestTimeoutMs: 10_000,
    shutdownTimeoutMs: 500,
    maintenanceEnabled: false,
    userAgent: "Gielinor-Load-Test/1.0.0",
  };
}

describe("hosted service load boundary", () => {
  it("serves 250 liveness requests at concurrency 25 within time and memory budgets", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gielinor-load-"));
    const hosted = createHostedHttpServer(loadConfig(directory), { logger: () => undefined });
    try {
      const address = await hosted.start();
      const url = `http://${address.host}:${address.port}/health/live`;
      const heapBefore = process.memoryUsage().heapUsed;
      const startedAt = performance.now();
      const responses: number[] = [];
      for (let batch = 0; batch < 10; batch += 1) {
        responses.push(
          ...(await Promise.all(
            Array.from({ length: 25 }, async () => {
              const response = await fetch(url);
              await response.arrayBuffer();
              return response.status;
            }),
          )),
        );
      }
      const elapsedMs = performance.now() - startedAt;
      const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

      expect(new Set(responses)).toEqual(new Set([200]));
      expect(elapsedMs).toBeLessThan(5_000);
      expect(heapGrowth).toBeLessThan(64 * 1024 * 1024);
    } finally {
      await hosted.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });
});
