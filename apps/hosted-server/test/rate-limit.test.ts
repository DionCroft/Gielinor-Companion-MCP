import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter } from "../src/rate-limit.js";

describe("fixed-window rate limiter", () => {
  it("enforces a limit and resets without retaining stale entries", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 500, 10, () => now);

    expect(limiter.consume("actor")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("actor")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("actor")).toMatchObject({ allowed: false, remaining: 0 });

    now = 1_501;
    expect(limiter.consume("actor")).toMatchObject({ allowed: true, remaining: 1 });
  });
});
