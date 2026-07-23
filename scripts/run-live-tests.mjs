import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const suite = process.argv[2] ?? "all";
const command = process.execPath;
const common = [
  join(process.cwd(), "node_modules", "vitest", "vitest.mjs"),
  "run",
  "--config",
  "vitest.live.config.ts",
];
const selections = {
  all: [],
  hiscores: [
    "packages/providers/test/live-providers.live.test.ts",
    "--testNamePattern",
    "Hiscores",
  ],
  itemdb: ["packages/providers/test/live-providers.live.test.ts", "--testNamePattern", "ItemDB"],
  prices: ["packages/providers/test/live-providers.live.test.ts", "--testNamePattern", "ItemDB"],
  wiki: [
    "packages/providers/test/runescape-wiki-quests.live.test.ts",
    "packages/providers/test/runescape-wiki-training.live.test.ts",
  ],
  training: ["packages/providers/test/runescape-wiki-training.live.test.ts"],
};

const selection = selections[suite];
if (selection === undefined) {
  process.stderr.write(`Unknown live-test suite: ${suite}\n`);
  process.exit(2);
}

const result = spawnSync(command, [...common, ...selection], {
  stdio: "inherit",
  env: { ...process.env, RUN_LIVE_API_TESTS: "1" },
});
if (result.error !== undefined) {
  process.stderr.write(`${result.error.message}\n`);
}
process.exit(result.status ?? 1);
