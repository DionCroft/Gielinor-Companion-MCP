import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const native = readFileSync(resolve(root, "apps/desktop/src-tauri/src/lib.rs"), "utf8");
const packer = readFileSync(resolve(root, "scripts/pack-portable.mjs"), "utf8");
const readme = readFileSync(resolve(root, "apps/desktop/README-PORTABLE.txt"), "utf8");

for (const required of [
  'argument == "--portable"',
  'join("portable-data").join("gielinor.db")',
  'root.join("runtime/dist/index.js")',
  '"gielinor-runtime.exe"',
]) {
  if (!native.includes(required)) throw new Error(`portable native path is missing ${required}`);
}
for (const required of [
  '"Gielinor Companion.exe"',
  '"README-PORTABLE.txt"',
  '"Launch Gielinor Companion Portable.cmd"',
  "--portable",
]) {
  if (!packer.includes(required)) throw new Error(`portable packer is missing ${required}`);
}
if (!/Deleting the\s+portable-data directory permanently deletes/i.test(readme)) {
  throw new Error("the portable README must explain local-data deletion risk");
}
if (!/never uses or modifies the installed per-user database/i.test(readme)) {
  throw new Error("the portable README must explain database isolation");
}
process.stdout.write("Portable-mode isolation and archive contract verified.\n");
