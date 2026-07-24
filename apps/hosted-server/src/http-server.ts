import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP } from "node:net";

import { createCompanionServer } from "@gielinor/mcp-server/library";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { AccountActivityTracker } from "./account-activity.js";
import { HostedAccountStore } from "./account-store.js";
import type { HostedConfig } from "./config.js";
import { FixedWindowRateLimiter, type RateLimitResult } from "./rate-limit.js";
import { HostedServiceFactory } from "./service-factory.js";
import type { HostedActor } from "./tool-access.js";

type JsonObject = Record<string, unknown>;

class PublicHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PublicHttpError";
  }
}

export type HostedLogRecord = {
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  actor?: HostedActor["kind"];
  code?: string;
};

export type HostedLogger = (record: HostedLogRecord) => void;

export type HostedServerDependencies = {
  accounts?: HostedAccountStore;
  services?: HostedServiceFactory;
  logger?: HostedLogger;
};

export type HostedHttpServer = {
  server: Server;
  start(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
};

const AccountImportBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    profiles: z.array(z.unknown()).max(20),
  })
  .strict();

function defaultLogger(record: HostedLogRecord): void {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), ...record })}\n`);
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(body));
  response.end(body);
}

function publicError(
  response: ServerResponse,
  requestId: string,
  status: number,
  code: string,
  message: string,
): void {
  writeJson(response, status, { error: { code, message, requestId } });
}

function requestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://host.invalid").pathname;
  } catch {
    return "/";
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function clientAddress(request: IncomingMessage, config: HostedConfig): string {
  if (config.trustProxy) {
    const forwarded = header(request, "x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded !== undefined && isIP(forwarded) !== 0) {
      return forwarded;
    }
  }
  return request.socket.remoteAddress ?? "unknown";
}

function bearerToken(request: IncomingMessage): string | undefined {
  const authorization = header(request, "authorization");
  if (authorization === undefined) {
    return undefined;
  }
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (match?.[1] === undefined) {
    throw new PublicHttpError(401, "INVALID_AUTHORIZATION", "Use a valid Bearer access token");
  }
  return match[1];
}

function authenticate(
  request: IncomingMessage,
  config: HostedConfig,
  accounts: HostedAccountStore,
): HostedActor {
  const addressHash = createHash("sha256")
    .update(clientAddress(request, config))
    .digest("hex")
    .slice(0, 24);
  const suppliedOperatorToken = header(request, "x-gielinor-operator-token");
  if (suppliedOperatorToken !== undefined) {
    if (
      config.operatorToken === undefined ||
      !safeEqual(suppliedOperatorToken, config.operatorToken)
    ) {
      throw new PublicHttpError(401, "INVALID_OPERATOR_TOKEN", "Operator authentication failed");
    }
    return { kind: "operator", rateLimitKey: `operator:${addressHash}` };
  }
  const token = bearerToken(request);
  if (token === undefined) {
    return { kind: "anonymous", rateLimitKey: `ip:${addressHash}` };
  }
  const account = accounts.authenticate(token);
  if (account === null) {
    throw new PublicHttpError(401, "INVALID_ACCESS_TOKEN", "Account authentication failed");
  }
  return { kind: "account", accountId: account.id, rateLimitKey: `account:${account.id}` };
}

function validateNetworkBoundary(
  request: IncomingMessage,
  response: ServerResponse,
  config: HostedConfig,
): void {
  const host = header(request, "host")?.toLowerCase();
  let hostname: string | undefined;
  try {
    hostname = host === undefined ? undefined : new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    hostname = undefined;
  }
  if (
    host === undefined ||
    hostname === undefined ||
    (!config.allowedHosts.has(host) && !config.allowedHosts.has(hostname))
  ) {
    throw new PublicHttpError(421, "HOST_NOT_ALLOWED", "The requested host is not allowed");
  }
  const origin = header(request, "origin");
  if (origin !== undefined && !config.allowedOrigins.has(origin)) {
    throw new PublicHttpError(403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
  }
  const forwardedProtocol = config.trustProxy
    ? header(request, "x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
    : undefined;
  const encrypted = "encrypted" in request.socket && request.socket.encrypted === true;
  if (config.requireHttps && !encrypted && forwardedProtocol !== "https") {
    response.setHeader("upgrade", "TLS/1.2");
    throw new PublicHttpError(426, "HTTPS_REQUIRED", "Use the HTTPS service endpoint");
  }
  if (origin !== undefined) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-expose-headers", "mcp-session-id, x-request-id");
  }
}

function securityHeaders(response: ServerResponse, requestId: string): void {
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
}

function rateHeaders(response: ServerResponse, result: RateLimitResult): void {
  response.setHeader("ratelimit-limit", result.limit);
  response.setHeader("ratelimit-remaining", result.remaining);
  response.setHeader("ratelimit-reset", Math.ceil(result.resetAt / 1000));
  if (!result.allowed) {
    response.setHeader("retry-after", Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
  }
}

async function readJsonBody(request: IncomingMessage, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(header(request, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    request.resume();
    throw new PublicHttpError(413, "REQUEST_TOO_LARGE", "The request body is too large");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.byteLength;
    if (total > maximumBytes) {
      throw new PublicHttpError(413, "REQUEST_TOO_LARGE", "The request body is too large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new PublicHttpError(400, "INVALID_JSON", "A JSON request body is required");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new PublicHttpError(400, "INVALID_JSON", "The request body must contain valid JSON");
  }
}

function jsonRpcMessages(value: unknown, maximum: number): JsonObject[] {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.length > maximum) {
    throw new PublicHttpError(
      400,
      "TOOL_CALL_LIMIT",
      `A request may contain at most ${maximum} protocol messages`,
    );
  }
  return values.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new PublicHttpError(400, "INVALID_MCP_MESSAGE", "Invalid MCP protocol message");
    }
    return entry as JsonObject;
  });
}

function toolCallCount(messages: JsonObject[]): number {
  return messages.filter((message) => message.method === "tools/call").length;
}

function isOptions(request: IncomingMessage): boolean {
  return request.method === "OPTIONS";
}

function handleOptions(response: ServerResponse): void {
  response.statusCode = 204;
  response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, last-event-id, mcp-protocol-version, x-gielinor-operator-token",
  );
  response.setHeader("access-control-max-age", "600");
  response.end();
}

function requireJsonContentType(request: IncomingMessage): void {
  const mediaType = header(request, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    mediaType !== "application/json" &&
    (mediaType === undefined || !mediaType.endsWith("+json"))
  ) {
    throw new PublicHttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send JSON with Content-Type application/json",
    );
  }
}

export function createHostedHttpServer(
  config: HostedConfig,
  dependencies: HostedServerDependencies = {},
): HostedHttpServer {
  const accounts = dependencies.accounts ?? new HostedAccountStore(config.controlDatabasePath);
  const services = dependencies.services ?? new HostedServiceFactory(config);
  const logger = dependencies.logger ?? defaultLogger;
  const requestLimiter = new FixedWindowRateLimiter(config.requestsPerMinute);
  const toolLimiter = new FixedWindowRateLimiter(config.toolCallsPerMinute);
  const accountActivity = new AccountActivityTracker();
  let closing = false;

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const path = requestPath(request);
    let actor: HostedActor | undefined;
    securityHeaders(response, requestId);
    response.once("finish", () => {
      logger({
        level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
        event: "http_request",
        requestId,
        method: request.method ?? "UNKNOWN",
        path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        ...(actor === undefined ? {} : { actor: actor.kind }),
      });
    });

    try {
      if (closing) {
        throw new PublicHttpError(503, "SHUTTING_DOWN", "The service is shutting down");
      }
      validateNetworkBoundary(request, response, config);
      if (isOptions(request)) {
        handleOptions(response);
        return;
      }
      if (request.method === "GET" && (path === "/health" || path === "/health/live")) {
        writeJson(response, 200, { status: "ok", version: "0.9.0" });
        return;
      }
      if (request.method === "GET" && path === "/health/ready") {
        if (!accounts.ready()) {
          throw new PublicHttpError(503, "NOT_READY", "Account storage is unavailable");
        }
        writeJson(response, 200, {
          status: "ready",
          version: "0.9.0",
          ...(await services.readiness()),
        });
        return;
      }
      actor = authenticate(request, config, accounts);
      if (actor.kind === "account" && !(request.method === "DELETE" && path === "/v1/account")) {
        if (!accountActivity.beginRequest(actor.accountId)) {
          throw new PublicHttpError(
            409,
            "ACCOUNT_DELETION_IN_PROGRESS",
            "Account deletion is in progress",
          );
        }
        let released = false;
        const releaseAccountRequest = (): void => {
          if (!released && actor?.kind === "account") {
            released = true;
            accountActivity.finishRequest(actor.accountId);
          }
        };
        response.once("finish", releaseAccountRequest);
        response.once("close", releaseAccountRequest);
      }
      const generalLimit = requestLimiter.consume(actor.rateLimitKey);
      rateHeaders(response, generalLimit);
      if (!generalLimit.allowed) {
        throw new PublicHttpError(429, "RATE_LIMITED", "Too many requests");
      }

      if (request.method === "POST" && path === "/v1/accounts") {
        if (!config.accountCreationEnabled) {
          throw new PublicHttpError(
            403,
            "ACCOUNT_CREATION_DISABLED",
            "Account creation is disabled",
          );
        }
        requireJsonContentType(request);
        const body = await readJsonBody(request, config.maxRequestBytes);
        if (
          typeof body !== "object" ||
          body === null ||
          Array.isArray(body) ||
          Object.keys(body).length !== 0
        ) {
          throw new PublicHttpError(400, "INVALID_ACCOUNT_REQUEST", "Send an empty JSON object");
        }
        const account = accounts.create();
        writeJson(response, 201, {
          accountId: account.id,
          accessToken: account.accessToken,
          createdAt: account.createdAt,
          tokenNotice: "Store this token securely. It cannot be recovered or shown again.",
        });
        return;
      }
      if (request.method === "GET" && path === "/v1/account/export") {
        if (actor.kind !== "account") {
          throw new PublicHttpError(401, "AUTH_REQUIRED", "Account authentication is required");
        }
        writeJson(response, 200, await services.exportAccount(actor.accountId));
        return;
      }
      if (request.method === "POST" && path === "/v1/account/import") {
        if (actor.kind !== "account") {
          throw new PublicHttpError(401, "AUTH_REQUIRED", "Account authentication is required");
        }
        requireJsonContentType(request);
        const body = AccountImportBodySchema.parse(
          await readJsonBody(request, config.maxRequestBytes),
        );
        writeJson(response, 200, await services.importAccount(actor.accountId, body));
        return;
      }
      if (request.method === "DELETE" && path === "/v1/account") {
        if (actor.kind !== "account") {
          throw new PublicHttpError(401, "AUTH_REQUIRED", "Account authentication is required");
        }
        if (!accountActivity.beginDeletion(actor.accountId)) {
          throw new PublicHttpError(
            409,
            "ACCOUNT_BUSY",
            "Retry deletion after active account requests finish",
          );
        }
        if (!accounts.beginDeletion(actor.accountId)) {
          accountActivity.cancelDeletion(actor.accountId);
          throw new PublicHttpError(409, "ACCOUNT_NOT_ACTIVE", "The account is not active");
        }
        try {
          services.deleteAccountData(actor.accountId);
          accounts.finishDeletion(actor.accountId);
          accountActivity.finishDeletion(actor.accountId);
        } catch {
          accounts.restoreAfterFailedDeletion(actor.accountId);
          accountActivity.cancelDeletion(actor.accountId);
          throw new PublicHttpError(
            503,
            "ACCOUNT_DELETION_FAILED",
            "Account deletion could not be completed",
          );
        }
        response.statusCode = 204;
        response.end();
        return;
      }
      if (path === "/mcp" && ["GET", "POST", "DELETE"].includes(request.method ?? "")) {
        if (request.method === "POST") {
          requireJsonContentType(request);
        }
        const parsedBody =
          request.method === "POST"
            ? await readJsonBody(request, config.maxRequestBytes)
            : undefined;
        if (parsedBody !== undefined) {
          const messages = jsonRpcMessages(parsedBody, config.maxBatchMessages);
          const calls = toolCallCount(messages);
          if (calls > 0) {
            const toolLimit = toolLimiter.consume(actor.rateLimitKey, calls);
            response.setHeader("x-tool-ratelimit-limit", toolLimit.limit);
            response.setHeader("x-tool-ratelimit-remaining", toolLimit.remaining);
            response.setHeader("x-tool-ratelimit-reset", Math.ceil(toolLimit.resetAt / 1000));
            if (!toolLimit.allowed) {
              throw new PublicHttpError(429, "TOOL_RATE_LIMITED", "Too many tool calls");
            }
          }
        }
        const session = services.createSession(actor);
        const mcpServer = createCompanionServer(session.tools);
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
        });
        try {
          await mcpServer.connect(transport as unknown as Transport);
          await transport.handleRequest(request, response, parsedBody);
        } finally {
          try {
            await mcpServer.close();
          } finally {
            session.close();
          }
        }
        return;
      }
      throw new PublicHttpError(404, "NOT_FOUND", "The requested endpoint was not found");
    } catch (error) {
      if (response.headersSent || response.writableEnded) {
        logger({
          level: "error",
          event: "request_failed_after_headers",
          requestId,
          code: "RESPONSE_ALREADY_STARTED",
        });
        response.end();
        return;
      }
      if (error instanceof PublicHttpError) {
        publicError(response, requestId, error.status, error.code, error.message);
        return;
      }
      if (error instanceof z.ZodError) {
        publicError(response, requestId, 400, "VALIDATION_ERROR", "The request was not valid");
        return;
      }
      logger({ level: "error", event: "request_failed", requestId, code: "INTERNAL_ERROR" });
      publicError(response, requestId, 500, "INTERNAL_ERROR", "The request could not be completed");
    }
  });

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 15_000);
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;

  return {
    server,
    start: () =>
      new Promise((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          const address = server.address();
          if (address === null || typeof address === "string") {
            reject(new Error("Hosted server did not bind to a TCP address"));
            return;
          }
          resolvePromise({ host: config.host, port: address.port });
        });
      }),
    close: async () => {
      if (closing) {
        return;
      }
      closing = true;
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolvePromise();
          } else {
            reject(error);
          }
        });
        setTimeout(() => server.closeAllConnections(), config.shutdownTimeoutMs).unref();
      });
      services.close();
      accounts.close();
    },
  };
}
