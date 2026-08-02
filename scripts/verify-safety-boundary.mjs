import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoots = [
  "apps/alt1-overlay/src",
  "apps/desktop/src",
  "apps/desktop/src-tauri/src",
  "apps/hosted-server/src",
  "apps/mcp-server/src",
  "packages/agent-runtime/src",
  "packages/core/src",
  "packages/database/src",
  "packages/providers/src",
];
const sourceExtensions = new Set([".js", ".mjs", ".rs", ".ts", ".tsx"]);
const forbidden = [
  {
    category: "game input generation",
    pattern: /\b(?:SendInput|keybd_event|mouse_event|robotjs|nut-js|pyautogui)\b/i,
  },
  {
    category: "RuneScape client memory access",
    pattern: /\b(?:ReadProcessMemory|WriteProcessMemory|processMemory|memoryRead|memoryWrite)\b/i,
  },
  {
    category: "game packet interception",
    pattern: /\b(?:packetRead|packetWrite|interceptGamePackets?|RuneScapePacket)\b/i,
  },
  {
    category: "Grand Exchange offer execution",
    pattern: /\b(?:placeGeOffer|submitGeOffer|cancelGeOffer|editGeOffer|executeGeTrade)\b/i,
  },
  {
    category: "RuneScape credential handling",
    pattern: /\b(?:runescapePassword|jagexPassword|jagexSessionToken|runescapeCookie)\b/i,
  },
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat();
}

const violations = [];
for (const relativeRoot of sourceRoots) {
  for (const path of await files(resolve(root, relativeRoot))) {
    if (!sourceExtensions.has(extname(path))) continue;
    const source = await readFile(path, "utf8");
    for (const rule of forbidden) {
      const match = source.match(rule.pattern);
      if (match !== null) {
        violations.push({
          category: rule.category,
          file: path.slice(root.length + 1).replaceAll("\\", "/"),
          token: match[0],
        });
      }
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(
      `Safety boundary violation: ${violation.category} in ${violation.file} (${violation.token})\n`,
    );
  }
  process.exit(1);
}

process.stdout.write(
  "Safety boundary verified: no game input, GE execution, credential, client-memory or packet-interception APIs detected.\n",
);
