import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createGielinorError,
  createTraceId,
  GIELINOR_ERROR_CODES,
  GIELINOR_ERROR_DEFINITIONS,
  GIELINOR_ERROR_REGISTRY,
  GielinorErrorException,
  GielinorErrorSchema,
  mapLegacyErrorCode,
  sanitisePublicDetails,
  toGielinorError,
} from "../src/index.js";

describe("Gielinor structured error registry", () => {
  it("publishes 62 unique, schema-valid error codes", () => {
    expect(GIELINOR_ERROR_CODES).toHaveLength(62);
    expect(new Set(GIELINOR_ERROR_CODES).size).toBe(GIELINOR_ERROR_CODES.length);
    expect(Object.keys(GIELINOR_ERROR_DEFINITIONS)).toEqual([...GIELINOR_ERROR_CODES]);

    for (const definition of GIELINOR_ERROR_REGISTRY) {
      const error = createGielinorError(definition.code, {
        timestamp: "2026-07-24T12:00:00.000Z",
        traceId: "00000000-0000-4000-8000-000000000001",
      });
      expect(GielinorErrorSchema.parse(error)).toMatchObject({
        code: definition.code,
        category: definition.category,
        severity: definition.severity,
        retryable: definition.retryable,
        recoverable: definition.recoverable,
      });
    }
  });

  it("creates unique trace identifiers and round-trips through JSON", () => {
    const first = createTraceId();
    const second = createTraceId();
    expect(first).not.toBe(second);

    const error = createGielinorError("GC-NET-001", {
      traceId: first,
      retryAfterMs: 1_000,
      details: { attempt: 2 },
    });
    expect(GielinorErrorSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
  });

  it("maps legacy errors while preserving their old code", () => {
    expect(mapLegacyErrorCode("PRICE_SYNC_FAILED")).toBe("GC-SYNC-001");
    const error = toGielinorError(
      Object.assign(new Error("Price refresh failed"), {
        code: "PRICE_SYNC_FAILED",
        retryable: true,
      }),
      { source: "test", operation: "refresh-prices" },
    );
    expect(error).toMatchObject({
      code: "GC-SYNC-001",
      legacyCode: "PRICE_SYNC_FAILED",
      retryable: true,
      source: "test",
      operation: "refresh-prices",
    });
  });

  it("normalises unknown values to the bounded unknown error", () => {
    expect(toGielinorError({ unexpected: true })).toMatchObject({
      code: "GC-UNKNOWN-999",
      category: "unknown",
      recoverable: false,
    });
  });

  it("redacts secrets, personal identifiers, paths, headers, stacks, and cycles", () => {
    const details: Record<string, unknown> = {
      token: "do-not-leak",
      displayName: "Private Hero",
      email: "player@example.test",
      filePath: "C:\\Users\\Private\\profile.db",
      headers: { authorization: "Bearer secret-value" },
      note: "token=another-secret C:\\Users\\Private\\cache.db player@example.test",
      nested: { safe: "visible" },
      stack: "at private function",
    };
    details.cycle = details;

    const serialised = JSON.stringify(sanitisePublicDetails(details));
    expect(serialised).toContain("visible");
    expect(serialised).toContain("[circular]");
    expect(serialised).not.toMatch(
      /do-not-leak|Private Hero|player@example\.test|secret-value|another-secret|profile\.db|cache\.db|private function/i,
    );
  });

  it("records only a bounded structured cause code", () => {
    const cause = new GielinorErrorException("GC-NET-001");
    const outer = new Error("Provider failed", { cause });
    expect(toGielinorError(outer, { fallbackCode: "GC-PROVIDER-001" })).toMatchObject({
      code: "GC-PROVIDER-001",
      causeCode: "GC-NET-001",
    });
    expect(JSON.stringify(toGielinorError(outer))).not.toContain("stack");
  });

  it("documents every published code", () => {
    const documentation = readFileSync(
      resolve(process.cwd(), "docs/errors/error-codes.md"),
      "utf8",
    );
    for (const code of GIELINOR_ERROR_CODES) {
      expect(documentation).toContain(`| ${code} |`);
    }
  });
});

describe("GielinorErrorException", () => {
  it("serialises only its validated public envelope", () => {
    const error = new GielinorErrorException("GC-CFG-001", {
      message: "Invalid setting",
      details: { password: "never-public" },
    });
    const serialised = JSON.stringify(error);
    expect(GielinorErrorSchema.parse(JSON.parse(serialised))).toEqual(error.gielinorError);
    expect(serialised).not.toMatch(/never-public|stack/i);
  });
});
