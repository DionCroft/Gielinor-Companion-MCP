export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type WindowEntry = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();

  public constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  public consume(key: string, amount = 1): RateLimitResult {
    const now = this.now();
    this.prune(now);
    const existing = this.entries.get(key);
    const entry =
      existing === undefined || existing.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : existing;
    entry.count += amount;
    this.entries.delete(key);
    this.entries.set(key, entry);

    return {
      allowed: entry.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      resetAt: entry.resetAt,
    };
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now || this.entries.size >= this.maxEntries) {
        this.entries.delete(key);
      }
      if (this.entries.size < this.maxEntries) {
        break;
      }
    }
  }
}
