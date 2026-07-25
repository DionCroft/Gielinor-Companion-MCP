import { MemoryCacheStore } from "@gielinor/providers";
import { describe, expect, it, vi } from "vitest";

import { SoftwareUpdateService } from "../src/update-service.js";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

function release(
  version: string,
  options: { prerelease?: boolean; digest?: string | null } = {},
): Record<string, unknown> {
  return {
    id: 1,
    tag_name: `v${version}`,
    name: `Version ${version}`,
    body: `Release notes for ${version}`,
    draft: false,
    prerelease: options.prerelease ?? false,
    published_at: "2026-07-24T10:00:00.000Z",
    html_url: `https://github.com/DionCroft/Gielinor-Companion-MCP/releases/tag/v${version}`,
    assets: [
      {
        name: "gielinor-companion-windows.zip",
        content_type: "application/zip",
        size: 1_024,
        browser_download_url: `https://github.com/DionCroft/Gielinor-Companion-MCP/releases/download/v${version}/gielinor-companion-windows.zip`,
        ...(options.digest === undefined
          ? { digest: "sha256:abc123" }
          : { digest: options.digest }),
      },
    ],
  };
}

function service(
  response: unknown,
  options: {
    cacheStore?: MemoryCacheStore;
    offline?: boolean;
    enabled?: boolean;
    fetchImplementation?: typeof fetch;
  } = {},
) {
  const fetchImplementation =
    options.fetchImplementation ?? vi.fn(async () => Response.json(response, { status: 200 }));
  return new SoftwareUpdateService({
    installedVersion: "1.1.0",
    cacheStore: options.cacheStore ?? new MemoryCacheStore(),
    userAgent: "Gielinor-Update-Test/1.1.0",
    offline: options.offline,
    enabled: options.enabled,
    fetchImplementation,
    maximumAttempts: 1,
    now: () => NOW,
  });
}

describe("read-only GitHub Releases update checker", () => {
  it("reports up-to-date and newer stable releases with validated assets", async () => {
    await expect(service([release("1.1.0")]).check()).resolves.toMatchObject({
      state: "up-to-date",
      installedVersion: "1.1.0",
      source: "live",
      release: { version: "1.1.0", assets: [{ digest: "sha256:abc123" }] },
    });
    await expect(service([release("1.2.0")]).check()).resolves.toMatchObject({
      state: "update-available",
      errorCode: "GC-UPDATE-002",
      release: { version: "1.2.0", prerelease: false },
    });
  });

  it("ignores prereleases unless explicitly opted in", async () => {
    const releases = [release("1.2.0-beta.1", { prerelease: true }), release("1.1.0")];
    await expect(service(releases).check()).resolves.toMatchObject({
      state: "up-to-date",
      release: { version: "1.1.0" },
    });
    await expect(service(releases).check({ includePrereleases: true })).resolves.toMatchObject({
      state: "pre-release-available",
      release: { version: "1.2.0-beta.1", prerelease: true },
    });
  });

  it("rejects invalid semantic versions and invalid release response shapes", async () => {
    await expect(service([release("not-semver")]).check()).resolves.toMatchObject({
      state: "invalid-release-metadata",
      errorCode: "GC-UPDATE-003",
    });
    await expect(service({ unexpected: true }).check()).resolves.toMatchObject({
      state: "invalid-release-metadata",
      errorCode: "GC-UPDATE-003",
    });
  });

  it("treats an empty official release list as a valid pre-release-project state", async () => {
    await expect(service([]).check()).resolves.toMatchObject({
      state: "up-to-date",
      source: "live",
      message: "No published releases are available yet",
    });
  });

  it("classifies rate limiting and network failures without exposing internals", async () => {
    const rateLimited = service([], {
      fetchImplementation: vi.fn(
        async () =>
          new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "60" },
          }),
      ),
    });
    await expect(rateLimited.check()).resolves.toMatchObject({
      state: "unable-to-check",
      errorCode: "GC-UPDATE-005",
      source: "none",
    });
    const networkFailure = service([], {
      fetchImplementation: vi.fn(async () => {
        throw new TypeError("private network failure details");
      }),
    });
    const result = await networkFailure.check();
    expect(result).toMatchObject({
      state: "unable-to-check",
      errorCode: "GC-UPDATE-001",
    });
    expect(JSON.stringify(result)).not.toContain("private network");
  });

  it("uses cached validated metadata during failures and while offline", async () => {
    const cacheStore = new MemoryCacheStore();
    await service([release("1.2.0")], { cacheStore }).check();
    const failing = service([], {
      cacheStore,
      fetchImplementation: vi.fn(async () => {
        throw new TypeError("network down");
      }),
    });
    await expect(failing.check({ forceRefresh: true })).resolves.toMatchObject({
      state: "update-available",
      source: "cache",
      errorCode: "GC-UPDATE-001",
    });
    const offlineFetch = vi.fn(async () => Response.json([]));
    await expect(
      service([], { cacheStore, offline: true, fetchImplementation: offlineFetch }).check(),
    ).resolves.toMatchObject({
      state: "offline",
      source: "cache",
      release: { version: "1.2.0" },
    });
    expect(offlineFetch).not.toHaveBeenCalled();
  });

  it("reports disabled, empty offline, and missing-checksum states safely", async () => {
    await expect(service([], { enabled: false }).check()).resolves.toMatchObject({
      state: "disabled",
      source: "none",
    });
    await expect(service([], { offline: true }).check()).resolves.toMatchObject({
      state: "offline",
      source: "none",
    });
    await expect(service([release("1.2.0", { digest: null })]).check()).resolves.toMatchObject({
      state: "update-available",
      warnings: ["GC-UPDATE-004"],
      release: { assets: [{ name: "gielinor-companion-windows.zip" }] },
    });
  });
});
