import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { GIELINOR_ERROR_REGISTRY } from "../packages/shared-types/dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "docs/errors/error-codes.md");

const guidance = {
  configuration: {
    cause: "A required setting is missing, malformed, or unsupported.",
    user: "Review Settings and correct the named value.",
    developer: "Validate configuration at startup and retain the stable code in logs.",
  },
  network: {
    cause: "The network, DNS, TLS, remote host, or cancellation signal interrupted a request.",
    user: "Check connectivity; retry only when the error says it is retryable.",
    developer: "Log timing and endpoint class, never credentials or complete URLs.",
  },
  provider: {
    cause: "An upstream public data provider was unavailable or returned an unusable response.",
    user: "Use cached data when offered and check provider health before retrying.",
    developer: "Validate the response, update breaker state, and try the configured fallback.",
  },
  validation: {
    cause: "Input or provider data did not satisfy a published schema or supported revision.",
    user: "Correct the highlighted input or refresh the affected dataset.",
    developer: "Reject at the boundary and record only redacted validation context.",
  },
  cache: {
    cause: "Cached data was absent, stale, unwritable, or failed integrity validation.",
    user: "Refresh the dataset; quarantine or clear only the affected cache entry if directed.",
    developer: "Preserve last-known-good data and quarantine corrupt records atomically.",
  },
  database: {
    cause: "SQLite could not open, migrate, validate, back up, restore, or commit safely.",
    user: "Stop other instances and use Diagnostics before attempting recovery.",
    developer:
      "Preserve the original file, roll back atomically, and enter safe mode when required.",
  },
  synchronisation: {
    cause: "A catalogue refresh failed, overlapped, was cancelled, or produced no valid result.",
    user: "Keep using last-known-good data and retry from Diagnostics when available.",
    developer:
      "Persist stage progress, classify the failure, and never replace valid data with invalid data.",
  },
  scheduler: {
    cause:
      "A persisted maintenance job failed, was missed, locked, or exhausted recovery attempts.",
    user: "Review the job in Diagnostics and use Run now only when no job is active.",
    developer: "Keep one active lease, persist attempts, and apply bounded backoff.",
  },
  update: {
    cause: "GitHub release metadata was unavailable, invalid, incomplete, or rate limited.",
    user: "Continue using the installed version and retry the check later.",
    developer: "Use conditional requests, cache valid metadata, and never auto-install.",
  },
  mcp: {
    cause: "An MCP request, tool name, execution, response, or deadline was invalid.",
    user: "Check tool arguments and retry only when the response marks the error retryable.",
    developer: "Validate both boundaries and correlate the request using the trace ID.",
  },
  "ai-provider": {
    cause: "A local AI provider, model, tool call, loop, or response deadline failed.",
    user: "Check the configured local provider and selected model.",
    developer: "Preserve explicit consent boundaries and enforce tool-loop limits.",
  },
  "hosted-service": {
    cause:
      "Hosted authentication, authorisation, isolation, or traffic limits rejected the request.",
    user: "Check credentials and permissions; wait for Retry-After when rate limited.",
    developer: "Keep tenants isolated and log only hashed or opaque actor references.",
  },
  security: {
    cause: "A security boundary rejected unsafe, secret-bearing, or untrusted input.",
    user: "Remove secrets or unsafe input and retry only after correcting it.",
    developer: "Fail closed, redact the event, and investigate repeated violations.",
  },
  unknown: {
    cause: "An unexpected failure could not be safely classified.",
    user: "Export redacted diagnostics and report the trace ID.",
    developer: "Use the trace ID to classify the root cause and add a stable code.",
  },
};

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function relatedCodes(definition) {
  const related = GIELINOR_ERROR_REGISTRY.filter(
    (candidate) => candidate.code !== definition.code && candidate.category === definition.category,
  )
    .slice(0, 3)
    .map((candidate) => candidate.code);
  return related.length === 0 ? "None" : related.join(", ");
}

const rows = GIELINOR_ERROR_REGISTRY.map((definition) => {
  const categoryGuidance = guidance[definition.category];
  return [
    definition.code,
    definition.meaning,
    categoryGuidance.cause,
    definition.retryable ? "Yes" : "No",
    definition.automaticRecovery,
    categoryGuidance.user,
    categoryGuidance.developer,
    "traceId, timestamp, source, operation, causeCode, legacyCode; redacted details only",
    relatedCodes(definition),
  ]
    .map(escapeCell)
    .join(" | ");
});

const serialized = `# Error code reference

Gielinor Companion errors use immutable codes so desktop, hosted, overlay, MCP, and
provider clients can apply the same recovery policy. Public errors contain a UUID
\`traceId\`; include it in reports instead of personal data, credentials, complete
paths, raw provider payloads, or stack traces.

The \`Retry?\` column describes whether an operation may be retried. Automatic retry
is always bounded and uses jitter. \`Automatic recovery\` is the strongest recovery
the application may attempt without user approval.

| Code | Meaning | Likely cause | Retry? | Automatic recovery | User action | Developer action | Safe logs | Related codes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map((row) => `| ${row} |`).join("\n")}

## Compatibility

Version 1 legacy codes remain available as \`legacyCode\` where a caller previously
depended on them. New integrations must branch on the stable \`GC-...\` code.
Unknown failures use \`GC-UNKNOWN-999\`; they must never expose a raw stack, secret,
absolute path, email address, player name, profile ID, or provider payload.
`;

const mode = process.argv[2];

if (mode === "--write") {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
} else if (mode === "--check") {
  const current = await readFile(outputPath, "utf8");
  if (current !== serialized) {
    throw new Error(
      "The committed error-code reference is stale. Run corepack pnpm generate:error-docs.",
    );
  }
  process.stdout.write("Error-code reference matches the runtime registry.\n");
} else {
  throw new Error("Use --write or --check");
}
