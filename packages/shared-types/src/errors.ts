import { z } from "zod";

export const GielinorErrorCategorySchema = z.enum([
  "configuration",
  "network",
  "provider",
  "validation",
  "cache",
  "database",
  "synchronisation",
  "scheduler",
  "update",
  "mcp",
  "ai-provider",
  "hosted-service",
  "security",
  "unknown",
]);
export type GielinorErrorCategory = z.infer<typeof GielinorErrorCategorySchema>;

export const GielinorErrorSeveritySchema = z.enum(["info", "warning", "error", "critical"]);
export type GielinorErrorSeverity = z.infer<typeof GielinorErrorSeveritySchema>;

export const AutomaticRecoverySchema = z.enum([
  "none",
  "bounded-retry",
  "fallback",
  "rollback",
  "safe-mode",
  "manual",
]);
export type AutomaticRecovery = z.infer<typeof AutomaticRecoverySchema>;

const ERROR_DEFINITIONS = [
  ["GC-CFG-001", "configuration", "Invalid configuration", "error", false, true, "manual"],
  ["GC-CFG-002", "configuration", "Missing required configuration", "error", false, true, "manual"],
  [
    "GC-CFG-003",
    "configuration",
    "Unsupported configuration value",
    "error",
    false,
    true,
    "manual",
  ],
  ["GC-NET-001", "network", "Network timeout", "warning", true, true, "bounded-retry"],
  ["GC-NET-002", "network", "DNS or connection failure", "warning", true, true, "bounded-retry"],
  ["GC-NET-003", "network", "TLS or certificate failure", "error", false, true, "manual"],
  ["GC-NET-004", "network", "Request cancelled", "info", false, true, "none"],
  ["GC-PROVIDER-001", "provider", "Provider unavailable", "warning", true, true, "fallback"],
  ["GC-PROVIDER-002", "provider", "Provider rate limited", "warning", true, true, "bounded-retry"],
  [
    "GC-PROVIDER-003",
    "provider",
    "Provider response contract changed",
    "error",
    false,
    true,
    "fallback",
  ],
  [
    "GC-PROVIDER-004",
    "provider",
    "Provider returned malformed data",
    "error",
    false,
    true,
    "fallback",
  ],
  [
    "GC-PROVIDER-005",
    "provider",
    "Provider returned an empty result",
    "error",
    false,
    true,
    "fallback",
  ],
  [
    "GC-PROVIDER-006",
    "provider",
    "Provider authentication rejected",
    "error",
    false,
    true,
    "manual",
  ],
  [
    "GC-PROVIDER-007",
    "provider",
    "All configured providers failed",
    "error",
    true,
    true,
    "bounded-retry",
  ],
  ["GC-DATA-001", "validation", "Data validation failed", "error", false, true, "none"],
  ["GC-DATA-002", "validation", "Data incomplete", "warning", false, true, "fallback"],
  [
    "GC-DATA-003",
    "validation",
    "Data conflict between providers",
    "warning",
    false,
    true,
    "manual",
  ],
  ["GC-DATA-004", "validation", "Unsupported data revision", "error", false, true, "manual"],
  ["GC-CACHE-001", "cache", "Cache miss", "info", true, true, "bounded-retry"],
  ["GC-CACHE-002", "cache", "Stale cache used", "warning", true, true, "bounded-retry"],
  ["GC-CACHE-003", "cache", "Cache write failed", "warning", true, true, "bounded-retry"],
  ["GC-CACHE-004", "cache", "Cache record quarantined", "warning", false, true, "fallback"],
  ["GC-CACHE-005", "cache", "Cache integrity failure", "error", false, true, "fallback"],
  ["GC-DB-001", "database", "Database unavailable", "error", true, true, "bounded-retry"],
  ["GC-DB-002", "database", "Database locked", "warning", true, true, "bounded-retry"],
  ["GC-DB-003", "database", "Migration failed", "critical", false, true, "rollback"],
  ["GC-DB-004", "database", "Integrity check failed", "critical", false, true, "safe-mode"],
  ["GC-DB-005", "database", "Transaction rolled back", "error", true, true, "rollback"],
  ["GC-DB-006", "database", "Backup failed", "critical", false, true, "manual"],
  ["GC-DB-007", "database", "Restore failed", "critical", false, true, "safe-mode"],
  [
    "GC-SYNC-001",
    "synchronisation",
    "Synchronisation failed",
    "error",
    true,
    true,
    "bounded-retry",
  ],
  [
    "GC-SYNC-002",
    "synchronisation",
    "Synchronisation partially completed",
    "warning",
    true,
    true,
    "bounded-retry",
  ],
  [
    "GC-SYNC-003",
    "synchronisation",
    "Synchronisation already running",
    "info",
    true,
    true,
    "bounded-retry",
  ],
  ["GC-SYNC-004", "synchronisation", "Synchronisation cancelled", "info", false, true, "none"],
  [
    "GC-SYNC-005",
    "synchronisation",
    "No valid catalogue available",
    "critical",
    true,
    true,
    "bounded-retry",
  ],
  ["GC-SCHED-001", "scheduler", "Background job failed", "error", true, true, "bounded-retry"],
  ["GC-SCHED-002", "scheduler", "Background job missed", "warning", true, true, "bounded-retry"],
  [
    "GC-SCHED-003",
    "scheduler",
    "Scheduler lock unavailable",
    "warning",
    true,
    true,
    "bounded-retry",
  ],
  [
    "GC-SCHED-004",
    "scheduler",
    "Maximum recovery attempts reached",
    "critical",
    false,
    false,
    "manual",
  ],
  ["GC-UPDATE-001", "update", "Update check failed", "warning", true, true, "bounded-retry"],
  ["GC-UPDATE-002", "update", "New version available", "info", false, true, "none"],
  ["GC-UPDATE-003", "update", "Invalid release metadata", "error", false, true, "fallback"],
  ["GC-UPDATE-004", "update", "Checksum unavailable", "warning", false, true, "none"],
  [
    "GC-UPDATE-005",
    "update",
    "Update service rate limited",
    "warning",
    true,
    true,
    "bounded-retry",
  ],
  ["GC-MCP-001", "mcp", "Invalid MCP request", "error", false, true, "none"],
  ["GC-MCP-002", "mcp", "Unknown MCP tool", "error", false, true, "none"],
  ["GC-MCP-003", "mcp", "MCP tool execution failed", "error", true, true, "bounded-retry"],
  ["GC-MCP-004", "mcp", "MCP response validation failed", "error", false, true, "none"],
  ["GC-MCP-005", "mcp", "MCP request timed out", "warning", true, true, "bounded-retry"],
  ["GC-AI-001", "ai-provider", "AI provider unavailable", "warning", true, true, "bounded-retry"],
  ["GC-AI-002", "ai-provider", "Model unavailable", "warning", false, true, "manual"],
  ["GC-AI-003", "ai-provider", "Invalid tool call", "error", false, true, "none"],
  ["GC-AI-004", "ai-provider", "Tool loop limit reached", "warning", false, true, "manual"],
  ["GC-AI-005", "ai-provider", "AI response timed out", "warning", true, true, "bounded-retry"],
  ["GC-HOSTED-001", "hosted-service", "Authentication failed", "error", false, true, "manual"],
  ["GC-HOSTED-002", "hosted-service", "Authorisation failed", "error", false, true, "manual"],
  [
    "GC-HOSTED-003",
    "hosted-service",
    "Rate limit exceeded",
    "warning",
    true,
    true,
    "bounded-retry",
  ],
  [
    "GC-HOSTED-004",
    "hosted-service",
    "User isolation violation prevented",
    "critical",
    false,
    true,
    "none",
  ],
  ["GC-SEC-001", "security", "Unsafe operation blocked", "critical", false, true, "none"],
  ["GC-SEC-002", "security", "Secret detected and redacted", "warning", false, true, "none"],
  ["GC-SEC-003", "security", "Untrusted input rejected", "error", false, true, "none"],
  ["GC-UNKNOWN-999", "unknown", "Unexpected internal error", "error", false, false, "manual"],
] as const satisfies readonly (readonly [
  string,
  GielinorErrorCategory,
  string,
  GielinorErrorSeverity,
  boolean,
  boolean,
  AutomaticRecovery,
])[];

export type GielinorErrorCode = (typeof ERROR_DEFINITIONS)[number][0];

export type GielinorErrorDefinition = {
  code: GielinorErrorCode;
  category: GielinorErrorCategory;
  meaning: string;
  severity: GielinorErrorSeverity;
  retryable: boolean;
  recoverable: boolean;
  automaticRecovery: AutomaticRecovery;
};

export const GIELINOR_ERROR_REGISTRY: readonly GielinorErrorDefinition[] = Object.freeze(
  ERROR_DEFINITIONS.map(
    ([code, category, meaning, severity, retryable, recoverable, automaticRecovery]) => ({
      code,
      category,
      meaning,
      severity,
      retryable,
      recoverable,
      automaticRecovery,
    }),
  ),
);

const registeredCodes = GIELINOR_ERROR_REGISTRY.map((definition) => definition.code);
if (new Set(registeredCodes).size !== registeredCodes.length) {
  throw new Error("Gielinor error registry contains duplicate codes");
}

export const GIELINOR_ERROR_CODES = Object.freeze(registeredCodes);
export const GielinorErrorCodeSchema = z.enum(
  registeredCodes as [GielinorErrorCode, ...GielinorErrorCode[]],
);

export const GIELINOR_ERROR_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    GIELINOR_ERROR_REGISTRY.map((definition) => [definition.code, definition]),
  ) as Record<GielinorErrorCode, GielinorErrorDefinition>,
);

export const GielinorErrorSchema = z
  .object({
    code: GielinorErrorCodeSchema,
    category: GielinorErrorCategorySchema,
    message: z.string().min(1).max(500),
    userMessage: z.string().min(1).max(500),
    severity: GielinorErrorSeveritySchema,
    retryable: z.boolean(),
    recoverable: z.boolean(),
    source: z.string().min(1).max(100).optional(),
    operation: z.string().min(1).max(100).optional(),
    timestamp: z.string().datetime({ offset: true }),
    traceId: z.string().uuid(),
    retryAfterMs: z.number().int().nonnegative().max(86_400_000).optional(),
    suggestedActions: z.array(z.string().min(1).max(200)).max(10).optional(),
    causeCode: GielinorErrorCodeSchema.optional(),
    details: z.record(z.unknown()).optional(),
    legacyCode: z.string().min(1).max(100).optional(),
    requestId: z.string().uuid().optional(),
  })
  .strict();
export type GielinorError = z.infer<typeof GielinorErrorSchema>;

const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|password|passwd|secret|session|token|api[-_]?key|private[-_]?key|raw[-_]?(?:body|data|payload)|headers?|stack|absolute[-_]?path|file[-_]?path|display[-_]?name|player[-_]?name|profile[-_]?id|account[-_]?id|email)/i;
const WINDOWS_PATH = /\b[A-Za-z]:\\[^\s"'<>|]+(?:\\[^\s"'<>|]+)*/g;
const UNIX_PRIVATE_PATH = /\/(?:Users|home|var|etc|opt|tmp|private|data)\/[^\s"'<>|]+/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~-]+/gi;
const SECRET_ASSIGNMENT =
  /\b(?:password|passwd|secret|token|api[-_]?key|authorization)=([^\s,;]+)/gi;
const PRIVATE_IDENTIFIER_ASSIGNMENT =
  /\b(?:display[-_]?name|player[-_]?name|profile[-_]?id|account[-_]?id|email)=([^\s,;]+)/gi;
const LONG_IDENTIFIER = /\b[A-Za-z0-9_-]{40,}\b/g;

function sanitiseString(value: string): string {
  return value
    .replace(BEARER, "Bearer [redacted]")
    .replace(SECRET_ASSIGNMENT, (match) => `${match.slice(0, match.indexOf("=") + 1)}[redacted]`)
    .replace(
      PRIVATE_IDENTIFIER_ASSIGNMENT,
      (match) => `${match.slice(0, match.indexOf("=") + 1)}[redacted]`,
    )
    .replace(EMAIL, "[redacted-email]")
    .replace(WINDOWS_PATH, "[redacted-path]")
    .replace(UNIX_PRIVATE_PATH, "[redacted-path]")
    .replace(LONG_IDENTIFIER, "[redacted-identifier]")
    .slice(0, 1_000);
}

function sanitiseUnknown(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return sanitiseString(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "undefined" || typeof value === "symbol" || typeof value === "function") {
    return undefined;
  }
  if (depth >= 4) {
    return "[truncated]";
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitiseString(value.message),
    };
  }
  if (typeof value !== "object") {
    return sanitiseString(String(value));
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((entry) => sanitiseUnknown(entry, depth + 1, seen))
      .filter((entry) => entry !== undefined);
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitiseUnknown(entry, depth + 1, seen);
  }
  return result;
}

export function sanitisePublicDetails(details: Record<string, unknown>): Record<string, unknown> {
  return sanitiseUnknown(details, 0, new WeakSet()) as Record<string, unknown>;
}

export function sanitisePublicMessage(message: string): string {
  const sanitised = sanitiseString(message).trim();
  return sanitised === "" ? "The operation could not be completed" : sanitised.slice(0, 500);
}

const LEGACY_ERROR_CODE_MAP: Readonly<Record<string, GielinorErrorCode>> = Object.freeze({
  INVALID_CONFIGURATION: "GC-CFG-001",
  MISSING_CONFIGURATION: "GC-CFG-002",
  UNSUPPORTED_FEATURE: "GC-CFG-003",
  PROVIDER_TIMEOUT: "GC-NET-001",
  TIMEOUT: "GC-NET-001",
  PROVIDER_UNAVAILABLE: "GC-PROVIDER-001",
  PROVIDER_HTTP_ERROR: "GC-PROVIDER-001",
  RATE_LIMITED: "GC-PROVIDER-002",
  TOOL_RATE_LIMITED: "GC-HOSTED-003",
  PROVIDER_RESPONSE_INVALID: "GC-PROVIDER-003",
  INVALID_PROVIDER_RESULT: "GC-PROVIDER-003",
  MALFORMED_PROVIDER_RESPONSE: "GC-PROVIDER-004",
  MALFORMED_TRAINING_DATA: "GC-PROVIDER-004",
  EMPTY_PROVIDER_RESPONSE: "GC-PROVIDER-005",
  ALL_PROVIDERS_FAILED: "GC-PROVIDER-007",
  INVALID_INPUT: "GC-DATA-001",
  VALIDATION_ERROR: "GC-DATA-001",
  INVALID_JSON: "GC-DATA-001",
  INVALID_STORED_DATA: "GC-DATA-001",
  NOT_FOUND: "GC-DATA-002",
  MISSING_QUEST_DATA: "GC-DATA-002",
  MISSING_TRAINING_RATE: "GC-DATA-002",
  UNSUPPORTED_DATA_VERSION: "GC-DATA-004",
  MISSING_DATA_MIGRATION: "GC-DATA-004",
  OFFLINE_CACHE_MISS: "GC-CACHE-001",
  DATABASE_WRITE_FAILED: "GC-DB-005",
  DATA_MIGRATION_FAILED: "GC-DB-003",
  PRICE_SYNC_FAILED: "GC-SYNC-001",
  QUEST_SYNC_FAILED: "GC-SYNC-001",
  TRAINING_SYNC_FAILED: "GC-SYNC-001",
  INVALID_MCP_MESSAGE: "GC-MCP-001",
  UNKNOWN_TOOL: "GC-MCP-002",
  TOOL_FAILED: "GC-MCP-003",
  INVALID_TOOL_OUTPUT: "GC-MCP-004",
  INVALID_TOOL_ARGUMENTS: "GC-AI-003",
  MALFORMED_TOOL_CALL: "GC-AI-003",
  LOOP_LIMIT_REACHED: "GC-AI-004",
  MODEL_UNAVAILABLE: "GC-AI-002",
  AUTH_REQUIRED: "GC-HOSTED-001",
  INVALID_ACCESS_TOKEN: "GC-HOSTED-001",
  INVALID_AUTHORIZATION: "GC-HOSTED-001",
  INVALID_OPERATOR_TOKEN: "GC-HOSTED-002",
  OPERATOR_REQUIRED: "GC-HOSTED-002",
  REQUEST_TOO_LARGE: "GC-SEC-003",
  HOST_NOT_ALLOWED: "GC-SEC-003",
  ORIGIN_NOT_ALLOWED: "GC-SEC-003",
  HTTPS_REQUIRED: "GC-SEC-003",
  INTERNAL_ERROR: "GC-UNKNOWN-999",
  STARTUP_ERROR: "GC-UNKNOWN-999",
});

export function mapLegacyErrorCode(
  legacyCode: string | undefined,
  fallback: GielinorErrorCode = "GC-UNKNOWN-999",
): GielinorErrorCode {
  if (legacyCode === undefined) {
    return fallback;
  }
  if (GielinorErrorCodeSchema.safeParse(legacyCode).success) {
    return legacyCode as GielinorErrorCode;
  }
  const exact = LEGACY_ERROR_CODE_MAP[legacyCode];
  if (exact !== undefined) {
    return exact;
  }
  if (/^(?:INVALID|MALFORMED|SUSPICIOUS|AMBIGUOUS|UNREACHABLE|VALUE_)/.test(legacyCode)) {
    return "GC-DATA-001";
  }
  if (/^(?:DATABASE|DB_)/.test(legacyCode)) {
    return "GC-DB-001";
  }
  if (/(?:SYNC|CATALOGUE)/.test(legacyCode)) {
    return "GC-SYNC-001";
  }
  if (/(?:PROVIDER|SOURCE)/.test(legacyCode)) {
    return "GC-PROVIDER-001";
  }
  return fallback;
}

function defaultSuggestedActions(definition: GielinorErrorDefinition): string[] {
  if (definition.retryable) {
    return ["Retry after the reported cooldown", "Check system diagnostics if the error repeats"];
  }
  if (definition.recoverable) {
    return ["Open system diagnostics", "Follow the documented troubleshooting steps"];
  }
  return ["Export redacted diagnostics", "Review the error code in the troubleshooting guide"];
}

export type CreateGielinorErrorInput = {
  message?: string | undefined;
  userMessage?: string | undefined;
  source?: string | undefined;
  operation?: string | undefined;
  timestamp?: string | undefined;
  traceId?: string | undefined;
  retryAfterMs?: number | undefined;
  suggestedActions?: string[] | undefined;
  causeCode?: GielinorErrorCode | undefined;
  details?: Record<string, unknown> | undefined;
  legacyCode?: string | undefined;
  requestId?: string | undefined;
  retryable?: boolean | undefined;
  recoverable?: boolean | undefined;
  severity?: GielinorErrorSeverity | undefined;
};

export function createTraceId(): string {
  return globalThis.crypto.randomUUID();
}

export function createGielinorError(
  code: GielinorErrorCode,
  input: CreateGielinorErrorInput = {},
): GielinorError {
  const definition = GIELINOR_ERROR_DEFINITIONS[code];
  return GielinorErrorSchema.parse({
    code,
    category: definition.category,
    message: sanitisePublicMessage(input.message ?? definition.meaning),
    userMessage: sanitisePublicMessage(input.userMessage ?? input.message ?? definition.meaning),
    severity: input.severity ?? definition.severity,
    retryable: input.retryable ?? definition.retryable,
    recoverable: input.recoverable ?? definition.recoverable,
    timestamp: input.timestamp ?? new Date().toISOString(),
    traceId: input.traceId ?? createTraceId(),
    suggestedActions: (input.suggestedActions ?? defaultSuggestedActions(definition)).map(
      sanitisePublicMessage,
    ),
    ...(input.source === undefined ? {} : { source: sanitisePublicMessage(input.source) }),
    ...(input.operation === undefined ? {} : { operation: sanitisePublicMessage(input.operation) }),
    ...(input.retryAfterMs === undefined ? {} : { retryAfterMs: input.retryAfterMs }),
    ...(input.causeCode === undefined ? {} : { causeCode: input.causeCode }),
    ...(input.details === undefined ? {} : { details: sanitisePublicDetails(input.details) }),
    ...(input.legacyCode === undefined
      ? {}
      : { legacyCode: sanitisePublicMessage(input.legacyCode) }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
  });
}

function errorEnvelopeCandidate(error: unknown): GielinorError | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  for (const key of ["gielinorError", "publicError", "envelope"] as const) {
    const parsed = GielinorErrorSchema.safeParse(Reflect.get(error, key));
    if (parsed.success) {
      return parsed.data;
    }
  }
  const parsed = GielinorErrorSchema.safeParse(error);
  return parsed.success ? parsed.data : undefined;
}

function causeCode(error: unknown): GielinorErrorCode | undefined {
  if (!(error instanceof Error) || error.cause === undefined) {
    return undefined;
  }
  const envelope = errorEnvelopeCandidate(error.cause);
  if (envelope !== undefined) {
    return envelope.code;
  }
  if (typeof error.cause === "object" && error.cause !== null) {
    const legacyCode = Reflect.get(error.cause, "code");
    return typeof legacyCode === "string" ? mapLegacyErrorCode(legacyCode) : undefined;
  }
  return undefined;
}

export type NormaliseGielinorErrorOptions = {
  fallbackCode?: GielinorErrorCode | undefined;
  source?: string | undefined;
  operation?: string | undefined;
  traceId?: string | undefined;
  requestId?: string | undefined;
  details?: Record<string, unknown> | undefined;
};

export function toGielinorError(
  error: unknown,
  options: NormaliseGielinorErrorOptions = {},
): GielinorError {
  const existing = errorEnvelopeCandidate(error);
  if (existing !== undefined) {
    return existing;
  }
  const legacyCode =
    typeof error === "object" && error !== null && typeof Reflect.get(error, "code") === "string"
      ? (Reflect.get(error, "code") as string)
      : undefined;
  const retryable =
    typeof error === "object" &&
    error !== null &&
    typeof Reflect.get(error, "retryable") === "boolean"
      ? (Reflect.get(error, "retryable") as boolean)
      : undefined;
  const stableCode = mapLegacyErrorCode(legacyCode, options.fallbackCode);
  const message =
    error instanceof Error ? error.message : "The requested operation could not be completed";
  return createGielinorError(stableCode, {
    message,
    source: options.source,
    operation: options.operation,
    traceId: options.traceId,
    requestId: options.requestId,
    details: options.details,
    legacyCode,
    retryable,
    causeCode: causeCode(error),
  });
}

export class GielinorErrorException extends Error {
  public readonly code: GielinorErrorCode;
  public readonly gielinorError: GielinorError;
  public readonly retryable: boolean;
  public readonly recoverable: boolean;

  public constructor(
    code: GielinorErrorCode,
    input: CreateGielinorErrorInput = {},
    options?: ErrorOptions,
  ) {
    const envelope = createGielinorError(code, input);
    super(envelope.message, options);
    this.name = "GielinorErrorException";
    this.code = code;
    this.gielinorError = envelope;
    this.retryable = envelope.retryable;
    this.recoverable = envelope.recoverable;
  }

  public toJSON(): GielinorError {
    return this.gielinorError;
  }
}
