import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const bridge = readFileSync(resolve(root, "apps/desktop/src/lib/native-bridge.ts"), "utf8");
const app = readFileSync(resolve(root, "apps/desktop/src/App.tsx"), "utf8");
const entry = readFileSync(resolve(root, "apps/desktop/src/main.tsx"), "utf8");
const native = readFileSync(resolve(root, "apps/desktop/src-tauri/src/lib.rs"), "utf8");

const failures = [];

if (!/if \(isTauri\(\)\)\s*{\s*return new TauriCompanionBridge\(\);\s*}/s.test(bridge)) {
  if (!/return isTauri\(\) \? new TauriCompanionBridge\(\)/.test(bridge)) {
    failures.push("createDefaultBridge must select the supported Tauri bridge first");
  }
}
if (/DemoCompanionBridge|demoProfile|preview fixture|fixture catalogue/i.test(bridge)) {
  failures.push("the native production bridge module must not contain preview fixture code");
}
if (app.includes('from "./lib/bridge.js"')) {
  failures.push("the production App must not import the preview/test bridge module");
}
if (!entry.includes('VITE_GIELINOR_ENABLE_PREVIEW !== "true"')) {
  failures.push("preview loading must require an explicit preview build flag");
}
if (!entry.includes('runtimeMode !== "browser-preview"')) {
  failures.push("browser preview must require an explicit runtime query mode");
}
if (!entry.includes('runtimeMode !== "automated-test"')) {
  failures.push("automated fixtures must require an explicit runtime query mode");
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

const assets = resolve(root, "apps/desktop/dist/assets");
if (existsSync(assets)) {
  const productionJavaScript = readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(resolve(assets, name), "utf8"))
    .join("\n");
  for (const forbidden of [
    "DemoCompanionBridge",
    "Demo Adventurer",
    "browser preview fixture",
    "fixture: Grand Exchange preview",
  ]) {
    if (productionJavaScript.includes(forbidden)) {
      failures.push(`the production webview bundle contains preview marker: ${forbidden}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`Native real-data boundary failed: ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Native real-data boundary verified: preview fixtures are absent from the production graph.\n",
  );
}
