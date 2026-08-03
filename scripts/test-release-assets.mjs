import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(resolve(tmpdir(), "gielinor-assets-"));
const bundle = resolve(temporary, "bundle");
const output = resolve(temporary, "output");
await mkdir(resolve(bundle, "nsis"), { recursive: true });
await mkdir(resolve(bundle, "msi"), { recursive: true });
await writeFile(resolve(bundle, "nsis", "generated-setup.exe"), "nsis-fixture");
await writeFile(resolve(bundle, "msi", "generated-installer.msi"), "msi-fixture");
const portable = resolve(temporary, "portable.zip");
await writeFile(portable, "portable-fixture");
const run = spawnSync(
  process.execPath,
  [
    resolve(root, "scripts/collect-desktop-assets.mjs"),
    "--platform",
    "windows",
    "--arch",
    "x64",
    "--source",
    bundle,
    "--output",
    output,
    "--portable",
    portable,
  ],
  { cwd: root, encoding: "utf8" },
);
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
const version = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version;
const expected = [
  [`Gielinor-Companion-Setup-${version}-x64.exe`, "nsis-fixture"],
  [`Gielinor-Companion-${version}-x64.msi`, "msi-fixture"],
  [`Gielinor-Companion-Portable-${version}-x64.zip`, "portable-fixture"],
];
for (const [name, content] of expected) {
  if ((await readFile(resolve(output, name), "utf8")) !== content) {
    throw new Error(`Release collector produced invalid ${name}`);
  }
}
process.stdout.write(`Stable Windows release asset names verified for ${version}.\n`);
