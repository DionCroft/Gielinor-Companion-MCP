import { describe, expect, it } from "vitest";

import { DATA_ORIGINS, DATA_ORIGIN_LABELS, DataProvenanceSchema } from "../src/index.js";

const NOW = "2026-08-03T00:00:00.000Z";

describe("universal data provenance", () => {
  it("provides one stable user-facing label for every machine origin", () => {
    expect(DATA_ORIGINS).toHaveLength(8);
    expect(DATA_ORIGINS.map((origin) => DATA_ORIGIN_LABELS[origin])).toEqual([
      "Live",
      "Cached",
      "Manual",
      "Imported",
      "Alt1 confirmed",
      "Calculated",
      "Preview",
      "Unavailable",
    ]);
  });

  it("accepts a current provider request as live public data", () => {
    expect(
      DataProvenanceSchema.parse({
        origin: "live-public",
        provider: "Jagex public Hiscores",
        timestamp: NOW,
        freshness: "fresh",
        cacheState: "miss",
        warnings: [],
      }).origin,
    ).toBe("live-public");
  });

  it("rejects cached data that is incorrectly labelled live", () => {
    expect(
      DataProvenanceSchema.safeParse({
        origin: "live-public",
        provider: "Jagex public Hiscores",
        timestamp: NOW,
        freshness: "fresh",
        cacheState: "fresh",
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("requires cached classifications to identify fresh or stale cache", () => {
    expect(
      DataProvenanceSchema.safeParse({
        origin: "validated-cache",
        provider: "local SQLite quest catalogue",
        timestamp: NOW,
        freshness: "unknown",
        cacheState: "not-applicable",
        warnings: [],
      }).success,
    ).toBe(false);
  });
});
