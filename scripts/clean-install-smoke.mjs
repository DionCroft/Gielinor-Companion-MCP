import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corepackCommand = process.platform === "win32" ? process.execPath : "corepack";
const corepackArguments =
  process.platform === "win32"
    ? [resolve(dirname(process.execPath), "node_modules/corepack/dist/corepack.js")]
    : [];
execFileSync(process.execPath, [resolve(root, "scripts/pack-release.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const archiveDirectory = resolve(root, "release/npm");
const archives = (await readdir(archiveDirectory)).filter((file) => file.endsWith(".tgz"));
const packageNames = [
  "@gielinor/shared-types",
  "@gielinor/core",
  "@gielinor/providers",
  "@gielinor/database",
  "@gielinor/agent-runtime",
  "@gielinor/mcp-server",
  "@gielinor/hosted-server",
];
const installationDirectory = await mkdtemp(join(tmpdir(), "gielinor-clean-install-"));
const resolvedTempRoot = resolve(tmpdir());
const relativeInstallation = relative(resolvedTempRoot, resolve(installationDirectory));
if (relativeInstallation.startsWith("..") || isAbsolute(relativeInstallation)) {
  throw new Error("Clean-install directory was created outside the operating-system temp");
}

try {
  const dependencies = {
    ...Object.fromEntries(
      packageNames.map((packageName) => {
        const archivePrefix = packageName.replace("@", "").replace("/", "-");
        const archive = archives.find((file) => file.startsWith(`${archivePrefix}-`));
        if (archive === undefined) {
          throw new Error(`Could not find packed archive for ${packageName}`);
        }
        return [packageName, pathToFileURL(resolve(archiveDirectory, archive)).href];
      }),
    ),
    "@modelcontextprotocol/sdk": "1.29.0",
  };
  await writeFile(
    resolve(installationDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "gielinor-clean-install-smoke",
        private: true,
        packageManager: "pnpm@10.34.5",
        dependencies,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const overrideLines = packageNames.map(
    (packageName) => `  '${packageName}': '${dependencies[packageName].replaceAll("'", "''")}'`,
  );
  await writeFile(
    resolve(installationDirectory, "pnpm-workspace.yaml"),
    `overrides:\n${overrideLines.join("\n")}\nonlyBuiltDependencies:\n  - better-sqlite3\n`,
    "utf8",
  );

  execFileSync(corepackCommand, [...corepackArguments, "pnpm", "install", "--prefer-offline"], {
    cwd: installationDirectory,
    stdio: "inherit",
  });

  const { Client } = await import(
    pathToFileURL(
      resolve(
        installationDirectory,
        "node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js",
      ),
    ).href
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(
      resolve(
        installationDirectory,
        "node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js",
      ),
    ).href
  );
  const databasePath = resolve(installationDirectory, "gielinor.db");
  const entry = resolve(installationDirectory, "node_modules/@gielinor/mcp-server/dist/index.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: {
      ...process.env,
      GIELINOR_DB_PATH: databasePath,
      GIELINOR_OFFLINE: "true",
      GIELINOR_USER_AGENT:
        "Gielinor-Companion-MCP-clean-install/1.0.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
    },
  });
  const client = new Client({ name: "clean-install-smoke", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    if (listed.tools.length !== 48) {
      throw new Error(`Clean npm installation exposed ${listed.tools.length} tools, expected 48`);
    }
  } finally {
    await client.close();
  }
  process.stdout.write("Clean packed npm installation exposed all 48 stable MCP tools.\n");
} finally {
  await rm(installationDirectory, { recursive: true, force: true });
}
