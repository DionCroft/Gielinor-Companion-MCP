import { z } from "zod";

import { GielinorErrorException, GielinorErrorSchema, type GielinorErrorCode } from "./errors.js";

export const RetryFailureKindSchema = z.enum([
  "cancelled",
  "timeout",
  "rate-limit",
  "transient-http",
  "network",
  "client-error",
  "validation",
  "database-busy",
  "retryable",
  "permanent",
  "unknown",
]);
export type RetryFailureKind = z.infer<typeof RetryFailureKindSchema>;

export type RetryClassification = {
  kind: RetryFailureKind;
  retryable: boolean;
  code: GielinorErrorCode;
  retryAfterMs?: number | undefined;
};

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxElapsedMs: number;
  jitterRatio: number;
};

export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 30_000,
  maxElapsedMs: 120_000,
  jitterRatio: 0.2,
});

export type RetryPolicyOverrides = Partial<RetryPolicy>;

export function resolveRetryPolicy(overrides: RetryPolicyOverrides = {}): RetryPolicy {
  const policy = {
    ...DEFAULT_RETRY_POLICY,
    ...overrides,
  };
  if (
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > 10
  ) {
    throw new GielinorErrorException("GC-CFG-003", {
      message: "Retry maxAttempts must be an integer between 1 and 10",
      source: "retry-policy",
      operation: "validate-policy",
    });
  }
  if (
    !Number.isFinite(policy.baseDelayMs) ||
    policy.baseDelayMs < 0 ||
    policy.baseDelayMs > 60_000
  ) {
    throw new GielinorErrorException("GC-CFG-003", {
      message: "Retry baseDelayMs must be between 0 and 60000",
      source: "retry-policy",
      operation: "validate-policy",
    });
  }
  if (
    !Number.isFinite(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.baseDelayMs ||
    policy.maxDelayMs > 86_400_000
  ) {
    throw new GielinorErrorException("GC-CFG-003", {
      message: "Retry maxDelayMs must be at least baseDelayMs and at most one day",
      source: "retry-policy",
      operation: "validate-policy",
    });
  }
  if (
    !Number.isFinite(policy.maxElapsedMs) ||
    policy.maxElapsedMs < 1 ||
    policy.maxElapsedMs > 86_400_000
  ) {
    throw new GielinorErrorException("GC-CFG-003", {
      message: "Retry maxElapsedMs must be between 1 and one day",
      source: "retry-policy",
      operation: "validate-policy",
    });
  }
  if (!Number.isFinite(policy.jitterRatio) || policy.jitterRatio < 0 || policy.jitterRatio > 1) {
    throw new GielinorErrorException("GC-CFG-003", {
      message: "Retry jitterRatio must be between 0 and 1",
      source: "retry-policy",
      operation: "validate-policy",
    });
  }
  return policy;
}

function numericProperty(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = Reflect.get(value, key);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = Reflect.get(value, key);
  return typeof candidate === "string" ? candidate : undefined;
}

function errorEnvelope(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const nested = GielinorErrorSchema.safeParse(Reflect.get(value, "gielinorError"));
  if (nested.success) {
    return nested.data;
  }
  const direct = GielinorErrorSchema.safeParse(value);
  return direct.success ? direct.data : undefined;
}

export function classifyRetryFailure(
  error: unknown,
  options: { signal?: AbortSignal | undefined } = {},
): RetryClassification {
  const legacyCode = stringProperty(error, "code");
  const name = stringProperty(error, "name");
  if (
    options.signal?.aborted === true ||
    name === "AbortError" ||
    legacyCode === "ABORT_ERR" ||
    legacyCode === "ERR_ABORTED"
  ) {
    return { kind: "cancelled", retryable: false, code: "GC-NET-004" };
  }

  const envelope = errorEnvelope(error);
  const retryAfterMs = numericProperty(error, "retryAfterMs") ?? envelope?.retryAfterMs;
  const status = numericProperty(error, "status");
  if (status === 429) {
    return {
      kind: "rate-limit",
      retryable: true,
      code: "GC-PROVIDER-002",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (status === 408 || status === 425) {
    return {
      kind: "transient-http",
      retryable: true,
      code: "GC-NET-001",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (status !== undefined && status >= 500 && status <= 599) {
    return {
      kind: "transient-http",
      retryable: true,
      code: "GC-PROVIDER-001",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (status !== undefined && status >= 400 && status <= 499) {
    return { kind: "client-error", retryable: false, code: "GC-DATA-001" };
  }

  if (envelope !== undefined) {
    if (
      envelope.code === "GC-NET-001" ||
      envelope.code === "GC-MCP-005" ||
      envelope.code === "GC-AI-005"
    ) {
      return {
        kind: "timeout",
        retryable: envelope.retryable,
        code: envelope.code,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    if (envelope.code === "GC-DB-002") {
      return {
        kind: "database-busy",
        retryable: envelope.retryable,
        code: envelope.code,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    return {
      kind: envelope.retryable ? "retryable" : "permanent",
      retryable: envelope.retryable,
      code: envelope.code,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }

  if (name === "ZodError" || legacyCode === "ERR_INVALID_ARG_TYPE") {
    return { kind: "validation", retryable: false, code: "GC-DATA-001" };
  }
  if (
    error instanceof TypeError ||
    legacyCode === "ECONNRESET" ||
    legacyCode === "ECONNREFUSED" ||
    legacyCode === "EAI_AGAIN" ||
    legacyCode === "ENETUNREACH" ||
    legacyCode === "EHOSTUNREACH"
  ) {
    return { kind: "network", retryable: true, code: "GC-NET-002" };
  }
  return { kind: "unknown", retryable: false, code: "GC-UNKNOWN-999" };
}

export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
  maximumMs = 86_400_000,
): number | undefined {
  if (value === null || value === undefined || value.trim() === "") {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), maximumMs);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.min(Math.max(0, date - now), maximumMs);
}

export function retryDelay(
  policy: RetryPolicy,
  retryIndex: number,
  retryAfterMs: number | undefined,
  random: () => number = Math.random,
): number {
  const boundedRandom = Math.min(1, Math.max(0, random()));
  if (retryAfterMs !== undefined) {
    const withUpwardJitter = retryAfterMs * (1 + boundedRandom * policy.jitterRatio);
    return Math.min(policy.maxDelayMs, Math.round(withUpwardJitter));
  }
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, retryIndex),
  );
  const jitterMultiplier = 1 - policy.jitterRatio + boundedRandom * policy.jitterRatio * 2;
  return Math.min(policy.maxDelayMs, Math.max(0, Math.round(exponential * jitterMultiplier)));
}

export type RetryAttemptEvent = {
  attempt: number;
  maxAttempts: number;
  outcome: "success" | "failure";
  durationMs: number;
  classification?: RetryClassification | undefined;
  nextDelayMs?: number | undefined;
};

export type RetryOperationContext = {
  attempt: number;
  maxAttempts: number;
  signal?: AbortSignal | undefined;
};

export type ExecuteWithRetryOptions = {
  policy?: RetryPolicyOverrides | undefined;
  signal?: AbortSignal | undefined;
  classify?: ((error: unknown) => RetryClassification) | undefined;
  onAttempt?: ((event: RetryAttemptEvent) => void) | undefined;
  sleep?: ((milliseconds: number, signal?: AbortSignal | undefined) => Promise<void>) | undefined;
  random?: (() => number) | undefined;
  now?: (() => number) | undefined;
};

function cancellationError(): GielinorErrorException {
  return new GielinorErrorException("GC-NET-004", {
    message: "The operation was cancelled",
    userMessage: "The operation was cancelled",
    source: "retry-policy",
    operation: "wait",
  });
}

async function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    throw cancellationError();
  }
  await new Promise<void>((resolve, reject) => {
    const complete = (): void => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = (): void => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      reject(cancellationError());
    };
    const timeout = globalThis.setTimeout(complete, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function emitAttempt(
  listener: ExecuteWithRetryOptions["onAttempt"],
  event: RetryAttemptEvent,
): void {
  try {
    listener?.(event);
  } catch {
    // Telemetry must never change the retry outcome.
  }
}

export async function executeWithRetry<T>(
  operation: (context: RetryOperationContext) => Promise<T>,
  options: ExecuteWithRetryOptions = {},
): Promise<T> {
  const policy = resolveRetryPolicy(options.policy);
  const classify =
    options.classify ??
    ((error: unknown) => classifyRetryFailure(error, { signal: options.signal }));
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const executionStartedAt = now();

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (options.signal?.aborted === true) {
      throw cancellationError();
    }
    const startedAt = now();
    try {
      const value = await operation({
        attempt,
        maxAttempts: policy.maxAttempts,
        signal: options.signal,
      });
      emitAttempt(options.onAttempt, {
        attempt,
        maxAttempts: policy.maxAttempts,
        outcome: "success",
        durationMs: Math.max(0, now() - startedAt),
      });
      return value;
    } catch (error) {
      const classification = classify(error);
      const mayRetry = classification.retryable && attempt < policy.maxAttempts;
      const nextDelayMs = mayRetry
        ? retryDelay(policy, attempt - 1, classification.retryAfterMs, random)
        : undefined;
      const elapsedMs = Math.max(0, now() - executionStartedAt);
      const willRetry =
        mayRetry && nextDelayMs !== undefined && elapsedMs + nextDelayMs <= policy.maxElapsedMs;
      emitAttempt(options.onAttempt, {
        attempt,
        maxAttempts: policy.maxAttempts,
        outcome: "failure",
        durationMs: Math.max(0, now() - startedAt),
        classification,
        ...(!willRetry || nextDelayMs === undefined ? {} : { nextDelayMs }),
      });
      if (!willRetry) {
        throw error;
      }
      await sleep(nextDelayMs ?? 0, options.signal);
    }
  }

  throw new GielinorErrorException("GC-UNKNOWN-999", {
    message: "Retry execution ended without an outcome",
    source: "retry-policy",
    operation: "execute",
  });
}
