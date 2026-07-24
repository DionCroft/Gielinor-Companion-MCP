import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, process.argv[2] ?? "release/assets");
const output = resolve(directory, "SHA256SUMS.txt");

async function filesBelow(current) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(path)));
    } else if (entry.isFile() && path !== output) {
      files.push(path);
    }
  }
  return files;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

const lines = [];
for (const file of (await filesBelow(directory)).sort()) {
  lines.push(`${await sha256(file)}  ${relative(directory, file).replaceAll("\\", "/")}`);
}
if (lines.length === 0) {
  throw new Error(`No release files found in ${directory}`);
}
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`Wrote ${lines.length} SHA-256 checksums to ${output}\n`);
