import { describe, expect, it } from "vitest";

import { overlayError } from "../src/errors.js";

describe("Alt1 structured errors", () => {
  it("classifies consent-boundary failures without exposing private values", () => {
    const error = overlayError(
      new Error("playerName=PrivateHero C:\\Users\\Private\\capture.png"),
      "grant-consent",
      "GC-SEC-003",
    );
    expect(error).toMatchObject({
      code: "GC-SEC-003",
      source: "alt1-overlay",
      operation: "grant-consent",
    });
    expect(JSON.stringify(error)).not.toMatch(/PrivateHero|capture\.png/i);
  });
});
