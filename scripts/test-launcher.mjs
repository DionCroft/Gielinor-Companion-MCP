import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const cmd = readFileSync(resolve(root, "Launch Gielinor Companion.cmd"), "utf8");
const launcher = readFileSync(resolve(root, "scripts/launch-gielinor.ps1"), "utf8");
const failures = [];

if (!cmd.includes("scripts\\launch-gielinor.ps1") || /node|pnpm|tauri/i.test(cmd)) {
  failures.push("the CMD shim must only delegate to the PowerShell launcher");
}
for (const required of [
  "Get-Command node",
  '@("22", "24")',
  "Get-Command corepack",
  "Get-Command rustc",
  '"--frozen-lockfile"',
  '"--no-bundle"',
  "VersionInfo.ProductVersion",
  "Start-Transcript",
]) {
  if (!launcher.includes(required)) failures.push(`the launcher is missing ${required}`);
}
if (/browser-preview|DemoCompanionBridge|demoProfile/.test(launcher)) {
  failures.push("the source launcher must never open or name a fixture fallback");
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}
process.stdout.write("Developer launcher contract verified.\n");
