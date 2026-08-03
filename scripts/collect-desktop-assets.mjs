import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import process from "node:process";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function required(files, predicate, description) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${description}; found ${matches.length}`);
  }
  return matches[0];
}

const root = resolve(import.meta.dirname, "..");
const platform = option("--platform");
const architecture = option("--arch", process.arch);
const source = resolve(
  option("--source", resolve(root, "apps/desktop/src-tauri/target/release/bundle")),
);
const output = resolve(option("--output", resolve(root, "release/desktop-assets")));
const portable = option("--portable");
if (!["windows", "macos", "linux"].includes(platform)) {
  throw new Error("--platform must be windows, macos, or linux");
}
if (!(await stat(source)).isDirectory()) throw new Error(`Bundle directory is missing: ${source}`);
const version = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version;
const files = await filesBelow(source);
const selected = [];

if (platform === "windows") {
  selected.push([
    required(
      files,
      (file) => extname(file).toLowerCase() === ".exe" && /[\\/]nsis[\\/]/i.test(file),
      "NSIS installer",
    ),
    `Gielinor-Companion-Setup-${version}-${architecture}.exe`,
  ]);
  selected.push([
    required(
      files,
      (file) => extname(file).toLowerCase() === ".msi" && /[\\/]msi[\\/]/i.test(file),
      "MSI installer",
    ),
    `Gielinor-Companion-${version}-${architecture}.msi`,
  ]);
  if (portable === undefined) throw new Error("Windows collection requires --portable <zip>");
  const portablePath =
    portable === "auto"
      ? required(
          await filesBelow(resolve(root, "release/assets")),
          (file) => /^Gielinor-Companion-Portable-.+-[^\\/]+\.zip$/i.test(basename(file)),
          "portable Windows archive",
        )
      : resolve(portable);
  if (!(await stat(portablePath)).isFile())
    throw new Error(`Portable archive is missing: ${portablePath}`);
  selected.push([portablePath, `Gielinor-Companion-Portable-${version}-${architecture}.zip`]);
} else if (platform === "macos") {
  selected.push([
    required(files, (file) => extname(file).toLowerCase() === ".dmg", "macOS DMG"),
    `Gielinor-Companion-${version}-macos-${architecture}.dmg`,
  ]);
} else {
  selected.push([
    required(files, (file) => extname(file).toLowerCase() === ".appimage", "Linux AppImage"),
    `Gielinor-Companion-${version}-linux-${architecture}.AppImage`,
  ]);
  selected.push([
    required(files, (file) => extname(file).toLowerCase() === ".deb", "Linux DEB"),
    `Gielinor-Companion-${version}-linux-${architecture}.deb`,
  ]);
}

await mkdir(output, { recursive: true });
for (const [input, name] of selected) {
  await copyFile(input, resolve(output, name));
  process.stdout.write(`${basename(input)} -> ${name}\n`);
}
