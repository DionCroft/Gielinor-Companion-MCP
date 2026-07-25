import { describe, expect, it } from "vitest";

import { ResilientHttpClient } from "../src/http.js";
import { RuneScapeWikiQuestProvider } from "../src/runescape-wiki-quests.js";

const live = process.env.RUN_LIVE_API_TESTS === "1";

describe.runIf(live)("live RuneScape Wiki quest provider smoke test", () => {
  it("loads a revisioned, validated quest snapshot", async () => {
    const provider = new RuneScapeWikiQuestProvider({
      httpClient: new ResilientHttpClient({
        userAgent:
          "Gielinor-Companion-MCP-live-test/1.1.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
        timeoutMs: 20_000,
      }),
    });

    const snapshot = await provider.fetchSnapshot();
    expect(snapshot.provider).toBe("RuneScape Wiki");
    expect(snapshot.quests.length).toBeGreaterThan(100);
    expect(snapshot.quests.every((quest) => quest.contentHash.length === 64)).toBe(true);
  });
});
