import { resolve } from "node:path";

import { z } from "zod";

const PortSchema = z.coerce.number().int().min(1).max(65_535);
const PositiveIntegerSchema = z.coerce.number().int().positive();
const BooleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

function optionalBoolean(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : BooleanStringSchema.parse(value.trim().toLowerCase());
}

function optionalInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : PositiveIntegerSchema.parse(value);
  return z.number().int().min(minimum).max(maximum).parse(parsed);
}

function list(value: string | undefined): string[] {
  return value === undefined
    ? []
    : [
        ...new Set(
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      ];
}

function origins(value: string | undefined): string[] {
  return list(value).map((entry) => {
    const url = new URL(entry);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw new Error(`Invalid allowed origin: ${entry}`);
    }
    return url.origin;
  });
}

function hosts(value: string | undefined): string[] {
  return list(value).map((entry) => {
    const normalized = entry.toLowerCase();
    if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/.test(normalized)) {
      throw new Error(`Invalid allowed host: ${entry}`);
    }
    return normalized;
  });
}

function operatorToken(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized === "") {
    return undefined;
  }
  if (normalized.length < 32 || normalized.length > 256) {
    throw new Error("GIELINOR_OPERATOR_TOKEN must contain 32 to 256 characters");
  }
  return normalized;
}

export type HostedConfig = {
  host: string;
  port: number;
  dataDirectory: string;
  publicDatabasePath: string;
  controlDatabasePath: string;
  accountDirectory: string;
  accountCreationEnabled: boolean;
  allowedOrigins: ReadonlySet<string>;
  allowedHosts: ReadonlySet<string>;
  trustProxy: boolean;
  requireHttps: boolean;
  operatorToken?: string;
  maxRequestBytes: number;
  maxBatchMessages: number;
  requestsPerMinute: number;
  toolCallsPerMinute: number;
  requestTimeoutMs: number;
  shutdownTimeoutMs: number;
  userAgent: string;
};

export function loadHostedConfig(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): HostedConfig {
  const dataDirectory = resolve(
    workingDirectory,
    environment.GIELINOR_HOSTED_DATA_DIR ?? "data/hosted",
  );
  const production = environment.NODE_ENV === "production";
  const configuredHosts = hosts(environment.GIELINOR_ALLOWED_HOSTS);
  const host = environment.GIELINOR_HOST ?? "127.0.0.1";
  const configuredOperatorToken = operatorToken(environment.GIELINOR_OPERATOR_TOKEN);

  return {
    host,
    port: PortSchema.parse(environment.PORT ?? environment.GIELINOR_HOSTED_PORT ?? "3333"),
    dataDirectory,
    publicDatabasePath: resolve(dataDirectory, "public.db"),
    controlDatabasePath: resolve(dataDirectory, "control.db"),
    accountDirectory: resolve(dataDirectory, "accounts"),
    accountCreationEnabled: optionalBoolean(
      environment.GIELINOR_ACCOUNT_CREATION_ENABLED,
      !production,
    ),
    allowedOrigins: new Set(origins(environment.GIELINOR_ALLOWED_ORIGINS)),
    allowedHosts: new Set(
      configuredHosts.length > 0 ? configuredHosts : ["localhost", "127.0.0.1", "[::1]"],
    ),
    trustProxy: optionalBoolean(environment.GIELINOR_TRUST_PROXY, false),
    requireHttps: optionalBoolean(environment.GIELINOR_REQUIRE_HTTPS, production),
    ...(configuredOperatorToken === undefined ? {} : { operatorToken: configuredOperatorToken }),
    maxRequestBytes: optionalInteger(
      environment.GIELINOR_MAX_REQUEST_BYTES,
      262_144,
      1_024,
      1_048_576,
    ),
    maxBatchMessages: optionalInteger(environment.GIELINOR_MAX_BATCH_MESSAGES, 4, 1, 16),
    requestsPerMinute: optionalInteger(environment.GIELINOR_REQUESTS_PER_MINUTE, 120, 1, 10_000),
    toolCallsPerMinute: optionalInteger(environment.GIELINOR_TOOL_CALLS_PER_MINUTE, 60, 1, 5_000),
    requestTimeoutMs: optionalInteger(
      environment.GIELINOR_HOSTED_REQUEST_TIMEOUT_MS,
      30_000,
      1_000,
      120_000,
    ),
    shutdownTimeoutMs: optionalInteger(
      environment.GIELINOR_SHUTDOWN_TIMEOUT_MS,
      10_000,
      1_000,
      60_000,
    ),
    userAgent:
      environment.GIELINOR_USER_AGENT ??
      "Gielinor-Companion-MCP/1.0.0 (hosted; contact: operator-not-configured)",
  };
}
