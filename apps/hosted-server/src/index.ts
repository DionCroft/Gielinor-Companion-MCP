#!/usr/bin/env node

import { loadHostedConfig } from "./config.js";
import { createHostedHttpServer } from "./http-server.js";

async function main(): Promise<void> {
  const config = loadHostedConfig();
  const hosted = createHostedHttpServer(config);
  const address = await hosted.start();
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "hosted_server_started",
      host: address.host,
      port: address.port,
      version: "0.7.0",
    })}\n`,
  );

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "hosted_server_stopping",
        signal,
      })}\n`,
    );
    await hosted.close();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.name : "STARTUP_ERROR";
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "hosted_server_start_failed",
      code,
      message: "The hosted MCP server could not start",
    })}\n`,
  );
  process.exitCode = 1;
});

export { loadHostedConfig } from "./config.js";
export { createHostedHttpServer } from "./http-server.js";
export type {
  HostedHttpServer,
  HostedLogger,
  HostedLogRecord,
  HostedServerDependencies,
} from "./http-server.js";
