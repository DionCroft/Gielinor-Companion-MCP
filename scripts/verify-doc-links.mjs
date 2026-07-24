import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "runtime",
  "target",
  "test-results",
]);

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

const failures = [];
for (const file of await markdownFiles(repositoryRoot)) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
    const rawTarget = match[1]?.trim() ?? "";
    const targetWithoutTitle = rawTarget.startsWith("<")
      ? rawTarget.slice(1, rawTarget.indexOf(">"))
      : rawTarget.split(/\s+["']/)[0];
    const target = targetWithoutTitle?.split("#", 1)[0] ?? "";
    if (
      target.length === 0 ||
      /^(?:https?:|mailto:|data:)/i.test(target) ||
      target.startsWith("#")
    ) {
      continue;
    }
    const resolved = resolve(dirname(file), decodeURIComponent(target));
    try {
      await stat(resolved);
    } catch {
      failures.push(`${relative(repositoryRoot, file)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Broken local documentation links:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("All local Markdown links resolve.\n");
}
