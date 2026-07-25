import { MemoryCacheStore } from "@gielinor/providers";
import { describe, expect, it } from "vitest";

import { SoftwareUpdateService } from "../src/update-service.js";

const live = process.env.RUN_LIVE_API_TESTS === "1";

describe.runIf(live)("live GitHub Releases update metadata", () => {
  it("loads and validates the official release list without downloading assets", async () => {
    const result = await new SoftwareUpdateService({
      installedVersion: "1.1.0",
      cacheStore: new MemoryCacheStore(),
      userAgent:
        "Gielinor-Companion-MCP-live-test/1.1.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
      maximumAttempts: 2,
    }).check({ forceRefresh: true });

    expect(["up-to-date", "update-available", "pre-release-available"]).toContain(result.state);
    expect(result.source).toBe("live");
    if (result.release !== undefined) {
      expect(result.release).toMatchObject({
        releaseUrl: expect.stringContaining(
          "github.com/DionCroft/Gielinor-Companion-MCP/releases/",
        ),
        prerelease: false,
      });
    }
  });
});
