import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const desktopRoot = join(repositoryRoot, "apps", "desktop");
const tauriRoot = join(desktopRoot, "src-tauri");
const version = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version;
const releaseRoot = resolve(
  process.env.GIELINOR_PORTABLE_OUTPUT ?? join(repositoryRoot, "release", "assets"),
);
const executable = resolve(
  process.env.GIELINOR_PORTABLE_EXECUTABLE ??
    join(tauriRoot, "target", "release", "gielinor-companion-desktop.exe"),
);
const sidecar = resolve(
  process.env.GIELINOR_PORTABLE_SIDECAR ??
    join(tauriRoot, "target", "release", "gielinor-runtime.exe"),
);
const runtime = resolve(process.env.GIELINOR_PORTABLE_RUNTIME ?? join(tauriRoot, "runtime"));
const directoryName = `Gielinor-Companion-Portable-${version}-x64`;
const stagingDirectory = join(releaseRoot, directoryName);
const archive = join(releaseRoot, `${directoryName}.zip`);

if (!stagingDirectory.startsWith(`${releaseRoot}\\`) && stagingDirectory !== releaseRoot) {
  throw new Error("Refusing to stage a portable package outside the release directory");
}
for (const [label, path] of [
  ["desktop executable", executable],
  ["MCP runtime executable", sidecar],
  ["runtime directory", runtime],
]) {
  if (!existsSync(path)) {
    throw new Error(`The ${label} is missing: ${relative(repositoryRoot, path)}`);
  }
}

mkdirSync(releaseRoot, { recursive: true });
rmSync(stagingDirectory, { recursive: true, force: true });
rmSync(archive, { force: true });
mkdirSync(stagingDirectory, { recursive: true });
copyFileSync(executable, join(stagingDirectory, "Gielinor Companion.exe"));
copyFileSync(sidecar, join(stagingDirectory, "gielinor-runtime.exe"));
cpSync(runtime, join(stagingDirectory, "runtime"), { recursive: true });
copyFileSync(
  join(desktopRoot, "README-PORTABLE.txt"),
  join(stagingDirectory, "README-PORTABLE.txt"),
);
writeFileSync(
  join(stagingDirectory, "Launch Gielinor Companion Portable.cmd"),
  '@start "" "%~dp0Gielinor Companion.exe" --portable\r\n',
  "utf8",
);

const packed = spawnSync(
  "tar",
  ["-a", "-c", "-f", archive, "-C", dirname(stagingDirectory), directoryName],
  { stdio: "inherit" },
);
if (packed.status !== 0) {
  throw new Error(`Could not create the portable ZIP (status ${String(packed.status)})`);
}

process.stdout.write(`${archive}\n`);
