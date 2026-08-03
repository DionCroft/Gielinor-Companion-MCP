import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(
  readFileSync(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
);
const native = readFileSync(resolve(root, "apps/desktop/src-tauri/src/lib.rs"), "utf8");
const cargo = readFileSync(resolve(root, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
const smoke = readFileSync(resolve(root, "scripts/smoke-windows-installer.ps1"), "utf8");
const releaseWorkflow = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
const nsis = config.bundle?.windows?.nsis;

if (config.version !== "1.2.0") throw new Error("the native installer version must be 1.2.0");
if (config.bundle?.active !== true) throw new Error("native bundling must remain enabled");
if (config.bundle?.targets !== "all") throw new Error("NSIS and MSI outputs must remain enabled");
if (nsis?.installMode !== "currentUser") throw new Error("NSIS must default to per-user install");
if (nsis?.startMenuFolder !== "Gielinor Companion") {
  throw new Error("NSIS must create a Gielinor Companion Start Menu folder");
}
if (!config.bundle.externalBin?.includes("binaries/gielinor-runtime")) {
  throw new Error("the installer must include the exact bundled MCP executable");
}
if (!config.bundle.resources?.includes("runtime/**/*")) {
  throw new Error("the installer must include the MCP runtime resources");
}
if (!cargo.includes("tauri-plugin-single-instance")) {
  throw new Error("the native app must prevent competing SQLite instances");
}
const singleInstance = native.indexOf("tauri_plugin_single_instance::init");
const httpPlugin = native.indexOf("tauri_plugin_http::init");
if (singleInstance < 0 || httpPlugin < 0 || singleInstance > httpPlugin) {
  throw new Error("the single-instance plugin must be registered first");
}
if (!native.includes('app.emit("gielinor://second-instance"')) {
  throw new Error("a second launch must notify the existing visible app");
}
for (const required of [
  "DisplayVersion",
  "Start Menu",
  "desktop shortcut",
  "Get-FileHash",
  'Start-Process -FilePath $uninstaller -ArgumentList "/S"',
]) {
  if (!smoke.includes(required))
    throw new Error(`the clean installer smoke test is missing ${required}`);
}
if (!releaseWorkflow.includes("smoke-windows-installer.ps1")) {
  throw new Error("the Windows release build must run the clean installer smoke test");
}
process.stdout.write("Windows installer and single-instance configuration verified.\n");
