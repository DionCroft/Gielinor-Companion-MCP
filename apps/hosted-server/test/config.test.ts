import { describe, expect, it } from "vitest";

import { loadHostedConfig } from "../src/config.js";

describe("hosted configuration", () => {
  it("loads bounded production defaults", () => {
    const config = loadHostedConfig(
      {
        NODE_ENV: "production",
        GIELINOR_ALLOWED_HOSTS: "mcp.example.com",
        GIELINOR_ALLOWED_ORIGINS: "https://chat.example.com",
        GIELINOR_OPERATOR_TOKEN: "x".repeat(32),
      },
      "C:\\service",
    );

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3333);
    expect(config.requireHttps).toBe(true);
    expect(config.accountCreationEnabled).toBe(false);
    expect(config.allowedHosts.has("mcp.example.com")).toBe(true);
    expect(config.allowedOrigins.has("https://chat.example.com")).toBe(true);
    expect(config.maxRequestBytes).toBe(262_144);
  });

  it("rejects unsafe or unbounded settings", () => {
    expect(() => loadHostedConfig({ GIELINOR_MAX_REQUEST_BYTES: "999999999" })).toThrow();
    expect(() => loadHostedConfig({ GIELINOR_ALLOWED_ORIGINS: "file:///private/data" })).toThrow();
    expect(() => loadHostedConfig({ GIELINOR_OPERATOR_TOKEN: "short" })).toThrow(/32 to 256/);
    expect(() => loadHostedConfig({ GIELINOR_ACCOUNT_CREATION_ENABLED: "sometimes" })).toThrow();
  });
});
