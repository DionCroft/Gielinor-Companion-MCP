import { describe, expect, it } from "vitest";

import {
  classifyRetryFailure,
  DEFAULT_RETRY_POLICY,
  executeWithRetry,
  GielinorErrorException,
  parseRetryAfter,
  resolveRetryPolicy,
  retryDelay,
  type RetryAttemptEvent,
} from "../src/index.js";

describe("retry failure classification", () => {
  it("retries only transient HTTP statuses and rate limits", () => {
    expect(classifyRetryFailure({ status: 400 })).toMatchObject({
      kind: "client-error",
      retryable: false,
    });
    expect(classifyRetryFailure({ status: 404 })).toMatchObject({
      kind: "client-error",
      retryable: false,
    });
    expect(classifyRetryFailure({ status: 408 })).toMatchObject({
      kind: "transient-http",
      retryable: true,
    });
    expect(classifyRetryFailure({ status: 425 })).toMatchObject({
      kind: "transient-http",
      retryable: true,
    });
    expect(classifyRetryFailure({ status: 429, retryAfterMs: 2_000 })).toEqual({
      kind: "rate-limit",
      retryable: true,
      code: "GC-PROVIDER-002",
      retryAfterMs: 2_000,
    });
    expect(classifyRetryFailure({ status: 503 })).toMatchObject({
      kind: "transient-http",
      retryable: true,
    });
  });

  it("classifies cancellation, validation, network, and unknown failures", () => {
    expect(classifyRetryFailure(new DOMException("cancelled", "AbortError"))).toMatchObject({
      kind: "cancelled",
      retryable: false,
    });
    expect(
      classifyRetryFailure(Object.assign(new Error("bad"), { name: "ZodError" })),
    ).toMatchObject({
      kind: "validation",
      retryable: false,
    });
    expect(classifyRetryFailure(new TypeError("fetch failed"))).toMatchObject({
      kind: "network",
      retryable: true,
    });
    expect(classifyRetryFailure(new Error("unclassified"))).toMatchObject({
      kind: "unknown",
      retryable: false,
    });
  });
});

describe("retry timing", () => {
  it("parses Retry-After seconds and HTTP dates with a safety cap", () => {
    const now = Date.parse("2026-07-24T12:00:00.000Z");
    expect(parseRetryAfter("2", now)).toBe(2_000);
    expect(parseRetryAfter("Fri, 24 Jul 2026 12:00:03 GMT", now)).toBe(3_000);
    expect(parseRetryAfter("999999", now, 30_000)).toBe(30_000);
    expect(parseRetryAfter("invalid", now)).toBeUndefined();
  });

  it("uses exponential backoff, bounded jitter, and Retry-After as a minimum", () => {
    const policy = resolveRetryPolicy({
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitterRatio: 0.2,
    });
    expect(retryDelay(policy, 0, undefined, () => 0)).toBe(80);
    expect(retryDelay(policy, 1, undefined, () => 0.5)).toBe(200);
    expect(retryDelay(policy, 9, undefined, () => 1)).toBe(1_000);
    expect(retryDelay(policy, 0, 500, () => 0)).toBe(500);
    expect(retryDelay(policy, 0, 500, () => 1)).toBe(600);
  });

  it("validates central policy bounds", () => {
    expect(DEFAULT_RETRY_POLICY).toMatchObject({
      maxAttempts: 3,
      baseDelayMs: 250,
      maxDelayMs: 30_000,
      maxElapsedMs: 120_000,
    });
    expect(() => resolveRetryPolicy({ maxAttempts: 0 })).toThrow(GielinorErrorException);
    expect(() => resolveRetryPolicy({ maxElapsedMs: 0 })).toThrow(GielinorErrorException);
    expect(() => resolveRetryPolicy({ jitterRatio: 2 })).toThrow(GielinorErrorException);
  });
});

describe("executeWithRetry", () => {
  it("records failed and successful attempts without changing the result", async () => {
    let calls = 0;
    const delays: number[] = [];
    const events: RetryAttemptEvent[] = [];
    const value = await executeWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw Object.assign(new TypeError("offline"), { code: "ECONNRESET" });
        }
        return "ready";
      },
      {
        policy: { baseDelayMs: 100, maxDelayMs: 1_000, jitterRatio: 0 },
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
        onAttempt: (event) => events.push(event),
      },
    );
    expect(value).toBe("ready");
    expect(delays).toEqual([100, 200]);
    expect(events.map((event) => event.outcome)).toEqual(["failure", "failure", "success"]);
    expect(events[0]).toMatchObject({
      attempt: 1,
      nextDelayMs: 100,
      classification: { kind: "network", retryable: true },
    });
  });

  it("does not retry permanent failures", async () => {
    let calls = 0;
    await expect(
      executeWithRetry(
        async () => {
          calls += 1;
          throw { status: 400 };
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toEqual({ status: 400 });
    expect(calls).toBe(1);
  });

  it("stops at the configured maximum attempts", async () => {
    let calls = 0;
    const failure = new TypeError("network unavailable");
    await expect(
      executeWithRetry(
        async () => {
          calls += 1;
          throw failure;
        },
        {
          policy: { maxAttempts: 2 },
          sleep: async () => undefined,
        },
      ),
    ).rejects.toBe(failure);
    expect(calls).toBe(2);
  });

  it("does not schedule a retry beyond the maximum elapsed time", async () => {
    let calls = 0;
    let now = 1_000;
    const delays: number[] = [];
    const failure = new TypeError("network unavailable");

    await expect(
      executeWithRetry(
        async () => {
          calls += 1;
          now += 90;
          throw failure;
        },
        {
          policy: {
            maxAttempts: 5,
            baseDelayMs: 20,
            maxDelayMs: 20,
            maxElapsedMs: 100,
            jitterRatio: 0,
          },
          now: () => now,
          sleep: async (milliseconds) => {
            delays.push(milliseconds);
            now += milliseconds;
          },
        },
      ),
    ).rejects.toBe(failure);

    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("honours cancellation before the first attempt", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await expect(
      executeWithRetry(
        async () => {
          calls += 1;
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({
      code: "GC-NET-004",
      retryable: false,
    });
    expect(calls).toBe(0);
  });
});
