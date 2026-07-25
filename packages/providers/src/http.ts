import { CompanionError } from "@gielinor/core";
import {
  executeWithRetry,
  mapLegacyErrorCode,
  parseRetryAfter,
  type GielinorErrorCode,
  type RetryAttemptEvent,
} from "@gielinor/shared-types";

import { InFlightRequestDeduplicator } from "./request-deduplicator.js";

export type ResilientHttpOptions = {
  userAgent: string;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  onAttempt?: (event: RetryAttemptEvent) => void;
};

export type ProviderErrorOptions = ErrorOptions & {
  gielinorCode?: GielinorErrorCode;
  retryAfterMs?: number;
  status?: number;
  operation?: string;
};

export class ProviderError extends CompanionError {
  public readonly retryAfterMs: number | undefined;
  public readonly status: number | undefined;

  public constructor(
    message: string,
    code: string,
    public readonly retryable: boolean,
    options?: ProviderErrorOptions,
  ) {
    super(message, code, {
      ...(options?.cause === undefined ? {} : { cause: options.cause }),
      gielinorCode: options?.gielinorCode ?? mapLegacyErrorCode(code, "GC-PROVIDER-001"),
      source: "providers",
      operation: options?.operation ?? "http-request",
      retryable,
      ...(options?.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs }),
    });
    this.name = "ProviderError";
    this.retryAfterMs = options?.retryAfterMs;
    this.status = options?.status;
  }
}

export function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class ResilientHttpClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterRatio: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onAttempt: ((event: RetryAttemptEvent) => void) | undefined;
  private readonly requests = new InFlightRequestDeduplicator<Response>();

  public constructor(private readonly options: ResilientHttpOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.jitterRatio = options.jitterRatio ?? 0.2;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.onAttempt = options.onAttempt;
  }

  public async get(
    url: URL,
    options: { signal?: AbortSignal | undefined } = {},
  ): Promise<Response> {
    if (options.signal !== undefined) {
      return (await this.getUnshared(url, options.signal)).clone();
    }
    const response = await this.requests.run(url.toString(), () => this.getUnshared(url));
    return response.clone();
  }

  private async getUnshared(url: URL, signal?: AbortSignal): Promise<Response> {
    return executeWithRetry(() => this.requestOnce(url, signal), {
      policy: {
        maxAttempts: this.retries + 1,
        baseDelayMs: this.baseDelayMs,
        maxDelayMs: this.maxDelayMs,
        jitterRatio: this.jitterRatio,
      },
      signal,
      sleep: async (milliseconds) => this.sleep(milliseconds),
      random: this.random,
      onAttempt: this.onAttempt,
    });
  }

  private async requestOnce(url: URL, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const cancelFromCaller = (): void => controller.abort();
    signal?.addEventListener("abort", cancelFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImplementation(url, {
        headers: {
          Accept: "application/json, text/plain;q=0.9",
          "User-Agent": this.options.userAgent,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        return response;
      }

      const retryable = shouldRetryStatus(response.status);
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after"),
        Date.now(),
        this.maxDelayMs,
      );
      await response.body?.cancel();
      throw new ProviderError(
        response.status === 404
          ? "The requested public RuneScape record was not found"
          : `RuneScape data provider returned HTTP ${response.status}`,
        response.status === 404
          ? "PROVIDER_NOT_FOUND"
          : response.status === 429
            ? "PROVIDER_RATE_LIMITED"
            : "PROVIDER_HTTP_ERROR",
        retryable,
        {
          status: response.status,
          ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
          gielinorCode:
            response.status === 404
              ? "GC-DATA-002"
              : response.status === 429
                ? "GC-PROVIDER-002"
                : response.status >= 400 && response.status <= 499 && !retryable
                  ? "GC-DATA-001"
                  : "GC-PROVIDER-001",
        },
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (signal?.aborted === true) {
        throw new ProviderError(
          "The RuneScape data request was cancelled",
          "REQUEST_CANCELLED",
          false,
          { cause: error, gielinorCode: "GC-NET-004" },
        );
      }
      throw new ProviderError(
        timedOut
          ? `RuneScape data provider timed out after ${this.timeoutMs}ms`
          : "RuneScape data provider could not be reached",
        timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        true,
        {
          cause: error,
          gielinorCode: timedOut ? "GC-NET-001" : "GC-NET-002",
        },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancelFromCaller);
    }
  }
}
