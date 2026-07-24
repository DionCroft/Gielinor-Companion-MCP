import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { READ_ONLY_CAPABILITIES, assertReadOnlyCapabilities } from "../src/contracts.js";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("Alt1 read-only distribution boundary", () => {
  it("declares only the minimum pixel and unclickable-overlay permissions", () => {
    const manifest = JSON.parse(read("../public/appconfig.json")) as {
      permissions: string;
      requestHandlers: unknown[];
      activators: unknown[];
    };
    expect(manifest.permissions).toBe("pixel,overlay");
    expect(manifest.requestHandlers).toEqual([]);
    expect(manifest.activators).toEqual([]);
  });

  it("pins the audited Alt1 library and minimum runtime version", () => {
    const packageJson = JSON.parse(read("../package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies.alt1).toBe("0.1.3");
    expect(read("../src/capture-controller.ts")).toContain(
      'export const MINIMUM_ALT1_VERSION = "1.6.0"',
    );
  });

  it("contains no gameplay input, memory or packet API in the Alt1 adapter", () => {
    const adapter = read("../src/alt1-adapter.ts");
    expect(adapter).not.toMatch(
      /\b(?:SendInput|keybd_event|mouse_event|robotjs|memoryRead|processMemory|packet(?:Read|Write)|socket)\b/i,
    );
    expect(READ_ONLY_CAPABILITIES).toMatchObject({
      gameplayInput: false,
      clientMemoryAccess: false,
      packetAccess: false,
      networkTransmission: false,
      rawTextPersistence: false,
    });
    expect(assertReadOnlyCapabilities).not.toThrow();
  });

  it("prevents the static overlay from transmitting captured data", () => {
    const html = read("../index.html");
    expect(html).toContain("connect-src 'none'");
    expect(read("../src/alt1-adapter.ts")).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\b/);
  });
});
