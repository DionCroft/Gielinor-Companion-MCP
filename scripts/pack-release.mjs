import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corepackCommand = process.platform === "win32" ? process.execPath : "corepack";
const corepackArguments =
  process.platform === "win32"
    ? [resolve(dirname(process.execPath), "node_modules/corepack/dist/corepack.js")]
    : [];
const output = resolve(root, "release/npm");
const releaseRoot = resolve(root, "release");
if (!output.startsWith(`${releaseRoot}\\`) && !output.startsWith(`${releaseRoot}/`)) {
  throw new Error("Refusing to prepare packages outside the repository release directory");
}

const packageDirectories = [
  "packages/shared-types",
  "packages/core",
  "packages/providers",
  "packages/database",
  "packages/agent-runtime",
  "apps/mcp-server",
  "apps/hosted-server",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const packageDirectory of packageDirectories) {
  execFileSync(
    corepackCommand,
    [...corepackArguments, "pnpm", "pack", "--pack-destination", output],
    {
      cwd: resolve(root, packageDirectory),
      stdio: "inherit",
    },
  );
}

const archives = (await readdir(output)).filter((file) => file.endsWith(".tgz")).sort();
if (archives.length !== packageDirectories.length) {
  throw new Error(`Expected ${packageDirectories.length} npm archives, found ${archives.length}`);
}
process.stdout.write(
  `Prepared ${archives.length} npm archives in ${relative(root, output)}:\n${archives.join("\n")}\n`,
);
