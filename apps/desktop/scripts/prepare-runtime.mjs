import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const tauriRoot = join(desktopRoot, "src-tauri");
const runtimeDirectory = join(tauriRoot, "runtime");
const binariesDirectory = join(tauriRoot, "binaries");

for (const target of [runtimeDirectory, binariesDirectory]) {
  if (!resolve(target).startsWith(resolve(tauriRoot))) {
    throw new Error("Refusing to prepare a runtime outside the desktop Tauri directory");
  }
}

const rustVersion = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const host = /^host:\s*(.+)$/m.exec(rustVersion)?.[1]?.trim();
if (host === undefined) {
  throw new Error("Could not determine the Rust host target");
}

rmSync(runtimeDirectory, {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 250,
});
mkdirSync(runtimeDirectory, { recursive: true });
mkdirSync(binariesDirectory, { recursive: true });

const bundledCorepack = join(
  dirname(process.execPath),
  "node_modules",
  "corepack",
  "dist",
  "corepack.js",
);
const packageManagerExecutable = existsSync(bundledCorepack) ? process.execPath : "corepack";
const packageManagerPrefix = existsSync(bundledCorepack) ? [bundledCorepack, "pnpm"] : ["pnpm"];
const deploy = spawnSync(
  packageManagerExecutable,
  [
    ...packageManagerPrefix,
    "--filter",
    "@gielinor/mcp-server",
    "deploy",
    "--prod",
    "--legacy",
    "--config.node-linker=hoisted",
    runtimeDirectory,
  ],
  {
    cwd: repositoryRoot,
    stdio: ["ignore", "inherit", "inherit"],
  },
);
if (deploy.status !== 0) {
  throw new Error(
    deploy.error?.message.trim() ||
      `Could not deploy the MCP runtime (status ${String(deploy.status)}, signal ${String(deploy.signal)})`,
  );
}

for (const moduleFormat of ["cjs", "esm"]) {
  rmSync(
    join(
      runtimeDirectory,
      "node_modules",
      "@modelcontextprotocol",
      "sdk",
      "dist",
      moduleFormat,
      "examples",
    ),
    {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    },
  );
}

const builtEntry = join(repositoryRoot, "apps", "mcp-server", "dist");
if (!existsSync(join(runtimeDirectory, "dist", "index.js")) && existsSync(builtEntry)) {
  cpSync(builtEntry, join(runtimeDirectory, "dist"), { recursive: true });
}

const executableName = `gielinor-runtime-${host}${process.platform === "win32" ? ".exe" : ""}`;
copyFileSync(process.execPath, join(binariesDirectory, executableName));

process.stdout.write(
  `Prepared bundled runtime for ${host}: runtime/dist/index.js and ${executableName}\n`,
);
