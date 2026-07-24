import { CompanionError } from "@gielinor/core";

import { InFlightRequestDeduplicator } from "./request-deduplicator.js";

export type ResilientHttpOptions = {
  userAgent: string;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class ProviderError extends CompanionError {
  public constructor(
    message: string,
    code: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, code, options);
    this.name = "ProviderError";
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (value === null) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 30_000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.min(Math.max(0, date - Date.now()), 30_000);
}

export class ResilientHttpClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly requests = new InFlightRequestDeduplicator<Response>();

  public constructor(private readonly options: ResilientHttpOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public async get(url: URL): Promise<Response> {
    const response = await this.requests.run(url.toString(), () => this.getUnshared(url));
    return response.clone();
  }

  private async getUnshared(url: URL): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

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
        const error = new ProviderError(
          response.status === 404
            ? "The requested public RuneScape record was not found"
            : `RuneScape data provider returned HTTP ${response.status}`,
          response.status === 404 ? "PROVIDER_NOT_FOUND" : "PROVIDER_HTTP_ERROR",
          retryable,
        );

        if (!retryable || attempt === this.retries) {
          throw error;
        }

        lastError = error;
        await response.body?.cancel();
        const delay = retryAfterMilliseconds(response) ?? this.baseDelayMs * 2 ** attempt;
        await this.sleep(delay);
      } catch (error) {
        lastError = error;
        const knownNonRetryable = error instanceof ProviderError && !error.retryable;
        if (knownNonRetryable || attempt === this.retries) {
          if (error instanceof ProviderError) {
            throw error;
          }
          const timedOut = controller.signal.aborted;
          throw new ProviderError(
            timedOut
              ? `RuneScape data provider timed out after ${this.timeoutMs}ms`
              : "RuneScape data provider could not be reached",
            timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
            true,
            { cause: error },
          );
        }
        await this.sleep(this.baseDelayMs * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ProviderError(
      "RuneScape data provider could not be reached",
      "PROVIDER_UNAVAILABLE",
      true,
      { cause: lastError },
    );
  }
}
