import { describe, expect, it } from "vitest";

import {
  assertSupportedNodeVersion,
  nodeCompatibility,
  SUPPORTED_NODE_MAJORS,
  SUPPORTED_NODE_RANGE,
} from "../src/index.js";

describe("Node.js runtime compatibility", () => {
  it("supports exactly the tested LTS majors", () => {
    expect(SUPPORTED_NODE_MAJORS).toEqual([22, 24]);
    expect(SUPPORTED_NODE_RANGE).toBe("^22.0.0 || ^24.0.0");
    expect(nodeCompatibility("v22.23.1")).toMatchObject({ major: 22, supported: true });
    expect(nodeCompatibility("24.18.0")).toMatchObject({ major: 24, supported: true });
  });

  it("rejects EOL, current, and malformed versions with a stable error", () => {
    for (const version of ["20.19.0", "25.1.0", "26.5.0", "unknown"]) {
      expect(() => assertSupportedNodeVersion(version)).toThrow(
        expect.objectContaining({
          gielinorError: expect.objectContaining({
            code: "GC-CFG-003",
            userMessage: expect.stringContaining("Node.js 22 or 24 LTS"),
          }),
        }),
      );
    }
  });
});
