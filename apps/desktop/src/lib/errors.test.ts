import { describe, expect, it } from "vitest";

import { desktopError } from "./errors.js";

describe("desktop structured errors", () => {
  it("creates a redacted, traceable public failure", () => {
    const error = desktopError(
      new Error("C:\\Users\\Private\\profile.db token=never-public"),
      "initialise-runtime",
      "GC-CFG-002",
    );
    expect(error).toMatchObject({
      code: "GC-CFG-002",
      source: "desktop",
      operation: "initialise-runtime",
    });
    expect(error.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(JSON.stringify(error)).not.toMatch(/Private|profile\.db|never-public/i);
  });
});
