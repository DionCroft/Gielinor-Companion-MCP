import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { GielinorErrorException, toGielinorError } from "../packages/shared-types/dist/index.js";
import {
  JagexGrandExchangeProvider,
  JagexHiscoresProvider,
  MemoryCacheStore,
  ResilientHttpClient,
  RuneScapeWikiQuestProvider,
  RuneScapeWikiTrainingProvider,
} from "../packages/providers/dist/index.js";
import { SoftwareUpdateService } from "../apps/mcp-server/dist/library.js";

const outputDirectory = resolve(process.cwd(), "artifacts/live-provider-monitor");
const userAgent =
  "Gielinor-Companion-MCP-live-monitor/1.1.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)";
const startedAt = new Date().toISOString();
const publicTestPlayer = process.env.GIELINOR_LIVE_TEST_PLAYER ?? "Zezima";

function contract(condition, message) {
  if (!condition) {
    throw new GielinorErrorException("GC-PROVIDER-003", {
      message,
      source: "live-provider-monitor",
      operation: "validate-live-contract",
    });
  }
}

function nestedCode(error) {
  let current = error;
  for (let depth = 0; depth < 6 && typeof current === "object" && current !== null; depth += 1) {
    const code = Reflect.get(current, "code");
    if (typeof code === "string") {
      return code;
    }
    current = Reflect.get(current, "cause");
  }
  return undefined;
}

function classification(error, code) {
  const causeCode = nestedCode(error);
  if (causeCode === "EAI_AGAIN" || causeCode === "ENOTFOUND") {
    return { kind: "dns-failure", meaningful: false };
  }
  if (code === "GC-NET-001" || causeCode === "ETIMEDOUT") {
    return { kind: "timeout", meaningful: false };
  }
  if (code === "GC-PROVIDER-002" || code === "GC-UPDATE-005") {
    return { kind: "rate-limiting", meaningful: false };
  }
  if (code === "GC-PROVIDER-005") {
    return { kind: "empty-response", meaningful: true };
  }
  if (code === "GC-PROVIDER-004") {
    return { kind: "malformed-response", meaningful: true };
  }
  if (code === "GC-PROVIDER-003" || code === "GC-UPDATE-003" || code === "GC-DATA-001") {
    return { kind: "schema-change", meaningful: true };
  }
  if (
    code === "GC-PROVIDER-001" ||
    code === "GC-PROVIDER-007" ||
    code === "GC-NET-002" ||
    code === "GC-UPDATE-001"
  ) {
    return { kind: "provider-outage", meaningful: false };
  }
  return { kind: "application-regression", meaningful: true };
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, milliseconds));
}

const httpClient = new ResilientHttpClient({
  userAgent,
  timeoutMs: 30_000,
  retries: 1,
});
const cacheStore = new MemoryCacheStore();
const geProvider = new JagexGrandExchangeProvider({ httpClient, cacheStore });

const checks = [
  {
    id: "jagex-hiscores",
    run: async () => {
      const result = await new JagexHiscoresProvider({ httpClient, cacheStore }).getPlayerStats(
        publicTestPlayer,
      );
      contract(result.skills.length === 29, "Hiscores skill count changed");
      return { skillCount: result.skills.length };
    },
  },
  {
    id: "jagex-itemdb-current",
    run: async () => {
      const result = await geProvider.getCurrentPrice(4151);
      contract(result.itemId === 4151 && result.currentPrice > 0, "ItemDB price contract changed");
      return { itemId: result.itemId, positiveGuidePrice: true };
    },
  },
  {
    id: "jagex-itemdb-history",
    run: async () => {
      const result = await geProvider.getPriceHistory(4151, "30d");
      contract(result.length > 20, "ItemDB history became empty or incomplete");
      return { pointCount: result.length };
    },
  },
  {
    id: "grand-exchange-catalogue",
    run: async () => {
      const result = await geProvider.fetchSnapshot();
      contract(result.items.length > 7_000, "Grand Exchange catalogue shrank suspiciously");
      return { recordCount: result.items.length };
    },
  },
  {
    id: "runescape-wiki-quests",
    run: async () => {
      const result = await new RuneScapeWikiQuestProvider({ httpClient }).fetchSnapshot();
      contract(result.quests.length > 100, "Quest catalogue became empty or incomplete");
      contract(
        result.quests.every((quest) => quest.contentHash.length === 64),
        "Quest content hashes are invalid",
      );
      return { recordCount: result.quests.length, revision: result.sourceRevision };
    },
  },
  {
    id: "runescape-wiki-training",
    run: async () => {
      const result = await new RuneScapeWikiTrainingProvider({ httpClient }).fetchSnapshot();
      contract(result.methods.length > 100, "Training catalogue became empty or incomplete");
      return { recordCount: result.methods.length, revision: result.sourceRevision };
    },
  },
  {
    id: "github-releases",
    run: async () => {
      const result = await new SoftwareUpdateService({
        installedVersion: "1.1.0",
        cacheStore,
        userAgent,
        maximumAttempts: 2,
      }).check({ forceRefresh: true });
      if (result.state === "unable-to-check" || result.state === "invalid-release-metadata") {
        throw new GielinorErrorException(result.errorCode ?? "GC-UPDATE-003", {
          message: result.message,
          traceId: result.traceId,
          source: "live-provider-monitor",
          operation: "github-releases",
        });
      }
      return {
        releaseCount: result.release === undefined ? 0 : 1,
        ...(result.release === undefined
          ? {}
          : {
              version: result.release.version,
              assetCount: result.release.assets.length,
              checksumCoverage: result.release.assets.filter((asset) => asset.digest !== undefined)
                .length,
            }),
      };
    },
  },
];

const results = [];
for (const [index, check] of checks.entries()) {
  const began = Date.now();
  try {
    const summary = await check.run();
    results.push({
      id: check.id,
      status: "passed",
      classification: "none",
      durationMs: Date.now() - began,
      summary,
    });
  } catch (error) {
    const structured = toGielinorError(error, {
      fallbackCode: "GC-UNKNOWN-999",
      source: "live-provider-monitor",
      operation: check.id,
    });
    const classified = classification(error, structured.code);
    results.push({
      id: check.id,
      status: classified.meaningful ? "failed" : "transient",
      classification: classified.kind,
      durationMs: Date.now() - began,
      errorCode: structured.code,
      traceId: structured.traceId,
      retryable: structured.retryable,
    });
  }
  if (index < checks.length - 1) {
    await sleep(750);
  }
}

const meaningfulFailures = results.filter((result) => result.status === "failed");
const transientFailures = results.filter((result) => result.status === "transient");
const report = {
  reportVersion: 1,
  startedAt,
  completedAt: new Date().toISOString(),
  overall:
    meaningfulFailures.length > 0
      ? "contract-failure"
      : transientFailures.length > 0
        ? "transient-failure"
        : "healthy",
  requestPolicy: {
    sequential: true,
    interCheckDelayMs: 750,
    attemptsPerRequest: 2,
    credentialsUsed: false,
    rawPayloadsStored: false,
  },
  counts: {
    passed: results.filter((result) => result.status === "passed").length,
    transient: transientFailures.length,
    failed: meaningfulFailures.length,
  },
  results,
  redactionNotice:
    "No credentials, player identifiers, response payloads, headers, URLs, or stack traces are included.",
};

const summaryLines = [
  "# Gielinor live provider monitor",
  "",
  `Overall: **${report.overall}**`,
  "",
  `Passed: ${report.counts.passed} · Transient: ${report.counts.transient} · Failed: ${report.counts.failed}`,
  "",
  "| Provider contract | Status | Classification | Code | Duration |",
  "| --- | --- | --- | --- | ---: |",
  ...results.map(
    (result) =>
      `| ${result.id} | ${result.status} | ${result.classification} | ${result.errorCode ?? "—"} | ${result.durationMs} ms |`,
  ),
  "",
  "Transient DNS, timeout, rate-limit, and provider-outage results are reported but do not fail the workflow. Schema, malformed/empty-response, and application-regression results fail it.",
  "",
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(resolve(outputDirectory, "summary.md"), `${summaryLines.join("\n")}\n`),
]);
process.stdout.write(`${JSON.stringify({ overall: report.overall, counts: report.counts })}\n`);
process.exitCode = meaningfulFailures.length > 0 ? 1 : 0;
