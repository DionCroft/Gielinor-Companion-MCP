import { describe, expect, it } from "vitest";

import { loadProviderConfig } from "../src/config.js";

describe("provider configuration", () => {
  it("enables explicit cache-only offline mode", () => {
    expect(loadProviderConfig({ GIELINOR_OFFLINE: "true" }).offline).toBe(true);
    expect(loadProviderConfig({ GIELINOR_OFFLINE: "0" }).offline).toBe(false);
  });

  it("rejects ambiguous offline values", () => {
    expect(() => loadProviderConfig({ GIELINOR_OFFLINE: "sometimes" })).toThrow();
  });
});
