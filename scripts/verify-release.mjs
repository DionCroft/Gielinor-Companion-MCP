import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { DATABASE_SCHEMA_VERSION, DATABASE_MIGRATIONS } from "../packages/database/dist/index.js";
import {
  APPLICATION_VERSION,
  COMPANION_TOOL_NAMES,
  CURRENT_COMPANION_TOOL_NAMES,
  MCP_TOOL_CONTRACT_VERSION,
  MCP_TOOL_CONTRACT_VERSION_V1_1,
  MCP_TOOL_NAMES_V1,
  MCP_TOOL_NAMES_V1_1,
  MCP_TOOL_SCHEMA_STABILITY,
  PROFILE_EXPORT_SCHEMA_VERSION,
} from "../packages/shared-types/dist/index.js";
import { PROVIDER_PLUGIN_API_VERSION } from "../packages/providers/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedVersion = "1.2.0";
const manifests = [
  "package.json",
  "apps/alt1-overlay/package.json",
  "apps/desktop/package.json",
  "apps/hosted-server/package.json",
  "apps/mcp-server/package.json",
  "packages/agent-runtime/package.json",
  "packages/core/package.json",
  "packages/database/package.json",
  "packages/providers/package.json",
  "packages/shared-types/package.json",
];
const publishable = new Set([
  "apps/hosted-server/package.json",
  "apps/mcp-server/package.json",
  "packages/agent-runtime/package.json",
  "packages/core/package.json",
  "packages/database/package.json",
  "packages/providers/package.json",
  "packages/shared-types/package.json",
]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const manifestPath of manifests) {
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), "utf8"));
  invariant(manifest.version === expectedVersion, `${manifestPath} is not ${expectedVersion}`);
  if (publishable.has(manifestPath)) {
    invariant(manifest.private !== true, `${manifestPath} is unexpectedly private`);
    invariant(
      manifest.publishConfig?.access === "public",
      `${manifestPath} lacks public npm publish configuration`,
    );
    invariant(
      manifest.repository?.url === "git+https://github.com/DionCroft/Gielinor-Companion-MCP.git",
      `${manifestPath} lacks the canonical repository`,
    );
  }
}

invariant(MCP_TOOL_CONTRACT_VERSION === "1.0", "MCP contract is not stable Version 1.0");
invariant(
  MCP_TOOL_CONTRACT_VERSION_V1_1 === "1.1",
  "Current additive MCP contract is not Version 1.1",
);
invariant(APPLICATION_VERSION === expectedVersion, "Runtime application version is inconsistent");
invariant(MCP_TOOL_SCHEMA_STABILITY === "stable", "MCP schema stability is not declared");
invariant(
  PROFILE_EXPORT_SCHEMA_VERSION === 1,
  "Profile export schema version changed unexpectedly",
);
invariant(PROVIDER_PLUGIN_API_VERSION === 1, "Provider plugin API version changed unexpectedly");
invariant(DATABASE_SCHEMA_VERSION === 8, "Database schema version changed unexpectedly");
invariant(
  DATABASE_MIGRATIONS.at(-1)?.version === DATABASE_SCHEMA_VERSION,
  "Database schema version does not match the migration chain",
);
invariant(COMPANION_TOOL_NAMES.length === 48, "Stable MCP tool count is not 48");
invariant(
  JSON.stringify(COMPANION_TOOL_NAMES) === JSON.stringify(MCP_TOOL_NAMES_V1),
  "Runtime MCP tool order differs from the stable Version 1 contract",
);
invariant(
  CURRENT_COMPANION_TOOL_NAMES.length === MCP_TOOL_NAMES_V1_1.length,
  "Current MCP tool count differs from the Version 1.1 contract",
);
invariant(
  JSON.stringify(CURRENT_COMPANION_TOOL_NAMES) === JSON.stringify(MCP_TOOL_NAMES_V1_1),
  "Runtime MCP tool order differs from the additive Version 1.1 contract",
);

const contract = JSON.parse(
  await readFile(resolve(root, "data/contracts/mcp-tools-v1.json"), "utf8"),
);
invariant(contract.contractVersion === "1.0", "Generated MCP manifest is not Version 1.0");
invariant(contract.toolCount === 48, "Generated MCP manifest does not contain 48 tools");
invariant(
  JSON.stringify(contract.tools.map((tool) => tool.name)) === JSON.stringify(MCP_TOOL_NAMES_V1),
  "Generated MCP manifest tool order differs from the stable contract",
);
const currentContract = JSON.parse(
  await readFile(resolve(root, "data/contracts/mcp-tools-v1.1.json"), "utf8"),
);
invariant(
  currentContract.contractVersion === "1.1",
  "Generated current MCP manifest is not Version 1.1",
);
invariant(
  currentContract.toolCount === MCP_TOOL_NAMES_V1_1.length,
  "Generated current MCP manifest has the wrong tool count",
);
invariant(
  JSON.stringify(currentContract.tools.map((tool) => tool.name)) ===
    JSON.stringify(MCP_TOOL_NAMES_V1_1),
  "Generated current MCP manifest tool order differs from the Version 1.1 contract",
);

const profileSchema = JSON.parse(
  await readFile(resolve(root, "data/schemas/profile-export.schema.json"), "utf8"),
);
invariant(
  profileSchema.properties?.schemaVersion?.const === PROFILE_EXPORT_SCHEMA_VERSION,
  "Profile JSON Schema does not match the stable export version",
);

const requiredFiles = [
  ".github/workflows/release.yml",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "ROADMAP.md",
  "SECURITY.md",
  "docs/architecture/migrations.md",
  "docs/architecture/overview.md",
  "docs/architecture/real-data-flow.md",
  "docs/architecture/player-private-data.md",
  "docs/architecture/market-intelligence.md",
  "docs/architecture/data-provenance.md",
  "docs/architecture/provider-plugins.md",
  "docs/architecture/resilience.md",
  "docs/architecture/scheduler.md",
  "docs/architecture/update-checker.md",
  "docs/errors/error-codes.md",
  "docs/errors/self-healing.md",
  "docs/errors/troubleshooting.md",
  "docs/examples/workflows.md",
  "docs/installation/chatgpt.md",
  "docs/installation/claude-code.md",
  "docs/installation/claude-desktop.md",
  "docs/installation/desktop.md",
  "docs/installation/one-click-windows.md",
  "docs/installation/portable-windows.md",
  "docs/installation/hosted.md",
  "docs/installation/lm-studio.md",
  "docs/installation/local-mcp.md",
  "docs/installation/ollama.md",
  "docs/mcp-tools/README.md",
  "docs/data-sources/ge-market-data.md",
  "docs/guides/holdings-and-trade-journal.md",
  "docs/guides/ge-recommendations.md",
  "docs/releases/v1.1.0-completion.md",
  "docs/releases/v1.1.0.md",
  "docs/releases/v1.2.0-completion.md",
  "docs/releases/v1.2.0-plan.md",
  "docs/releases/v1.2.0.md",
  "docs/security/release-integrity.md",
  "docs/testing/release-validation.md",
  "docs/testing/fault-injection.md",
  "docs/testing/live-provider-monitoring.md",
  "docs/testing/installer-acceptance.md",
  "docs/testing/live-data-audit.md",
  "docs/testing/market-backtesting.md",
  "docs/testing/node-compatibility.md",
];
await Promise.all(requiredFiles.map((path) => access(resolve(root, path))));

const readme = await readFile(resolve(root, "README.md"), "utf8");
invariant(readme.includes("Current version: 1.2.0"), "README does not identify Version 1.2.0");
invariant(
  readme.includes("Download for Windows"),
  "README does not lead with Windows download guidance",
);
invariant(
  readme.includes("unofficial community project"),
  "README lacks the affiliation disclaimer",
);

const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
for (const expected of [
  "v*.*.*",
  "test:release",
  "pack:release",
  "generate-checksums.mjs",
  "anchore/sbom-action@v0",
  "actions/attest@v4",
  "tauri-apps/tauri-action@v1",
  "smoke-windows-installer.ps1",
  "collect-desktop-assets.mjs",
]) {
  invariant(workflow.includes(expected), `Release workflow lacks ${expected}`);
}

process.stdout.write(
  `Release metadata verified: ${expectedVersion}, 48 frozen Version 1.0 tools, ${MCP_TOOL_NAMES_V1_1.length} current tools, profile v1, database v${DATABASE_SCHEMA_VERSION}, provider API v${PROVIDER_PLUGIN_API_VERSION}.\n`,
);
