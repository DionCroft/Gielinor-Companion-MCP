import { SKILL_IDS } from "@gielinor/shared-types";
import { describe, expect, it } from "vitest";

import { ResilientHttpClient } from "../src/http.js";
import { RuneScapeWikiTrainingProvider } from "../src/runescape-wiki-training.js";

const live = process.env.RUN_LIVE_API_TESTS === "1";

describe.runIf(live)("live RuneScape Wiki training provider smoke test", () => {
  it("loads a complete revisioned training snapshot", async () => {
    const provider = new RuneScapeWikiTrainingProvider({
      httpClient: new ResilientHttpClient({
        userAgent:
          "Gielinor-Companion-MCP-live-test/0.9.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
        timeoutMs: 30_000,
      }),
    });

    const snapshot = await provider.fetchSnapshot();
    expect(snapshot.provider).toBe("RuneScape Wiki");
    expect(snapshot.methods.length).toBeGreaterThan(100);
    expect(new Set(snapshot.methods.map((method) => method.skillId)).size).toBe(SKILL_IDS.length);
    expect(snapshot.methods.every((method) => method.contentHash.length === 64)).toBe(true);
    expect(
      snapshot.methods.every(
        (method) =>
          method.xpPerHourRange === undefined ||
          (method.xpPerHourRange.minimum > 0 && method.xpPerHourRange.maximum <= 50_000_000),
      ),
    ).toBe(true);
  });
});
