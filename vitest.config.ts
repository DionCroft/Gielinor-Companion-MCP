import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**", "**/dist/**"],
    coverage: {
      reporter: ["text", "html"],
      include: ["packages/*/src/**/*.ts", "apps/mcp-server/src/**/*.ts"],
    },
  },
});
