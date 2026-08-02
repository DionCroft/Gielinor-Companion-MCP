import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const bridge = readFileSync(resolve(root, "apps/desktop/src/lib/bridge.ts"), "utf8");
const native = readFileSync(resolve(root, "apps/desktop/src-tauri/src/lib.rs"), "utf8");

const failures = [];

if (!/if \(isTauri\(\)\)\s*{\s*return new TauriCompanionBridge\(\);\s*}/s.test(bridge)) {
  failures.push("createDefaultBridge must select the supported Tauri bridge first");
}
if (bridge.includes("import.meta.env.DEV ?")) {
  failures.push("development mode must not implicitly select a fixture bridge");
}
if (!bridge.includes('requestedMode === "browser-preview"')) {
  failures.push("browser preview must require an explicit runtime mode");
}
if (!bridge.includes('requestedMode === "automated-test"')) {
  failures.push("automated fixtures must require an explicit runtime mode");
}
if (!native.includes('mode: "native-real"')) {
  failures.push("the native runtime must report native-real mode");
}
if (/demo|fixture/i.test(native)) {
  failures.push("the native Rust bridge must not contain demo or fixture paths");
}
if (/cfg\(not\(debug_assertions\)\)[\s\S]*development_entry\(\)/.test(native)) {
  failures.push("production native runtime must not fall back to a workspace development entry");
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`Native real-data boundary failed: ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Native real-data boundary verified: no implicit demo path.\n");
}
