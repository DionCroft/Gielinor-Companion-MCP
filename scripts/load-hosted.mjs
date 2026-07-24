function boundedInteger(value, fallback, minimum, maximum, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

const baseUrl = process.env.GIELINOR_LOAD_URL;
if (baseUrl === undefined) {
  throw new Error("Set GIELINOR_LOAD_URL to the hosted service base URL");
}
const url = new URL("/health/live", baseUrl);
const total = boundedInteger(process.env.GIELINOR_LOAD_REQUESTS, 1_000, 1, 100_000, "requests");
const concurrency = boundedInteger(
  process.env.GIELINOR_LOAD_CONCURRENCY,
  25,
  1,
  200,
  "concurrency",
);
let next = 0;
let failures = 0;
const durations = [];
const startedAt = performance.now();

async function worker() {
  while (next < total) {
    next += 1;
    const requestStartedAt = performance.now();
    try {
      const response = await globalThis.fetch(url);
      await response.arrayBuffer();
      if (!response.ok) {
        failures += 1;
      }
    } catch {
      failures += 1;
    }
    durations.push(performance.now() - requestStartedAt);
  }
}

await Promise.all(Array.from({ length: Math.min(total, concurrency) }, worker));
durations.sort((left, right) => left - right);
const percentile = (fraction) =>
  durations[Math.min(durations.length - 1, Math.floor(durations.length * fraction))] ?? 0;
const report = {
  target: url.origin,
  requests: total,
  concurrency,
  failures,
  durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  p50Ms: Math.round(percentile(0.5) * 100) / 100,
  p95Ms: Math.round(percentile(0.95) * 100) / 100,
  p99Ms: Math.round(percentile(0.99) * 100) / 100,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures > 0) {
  process.exitCode = 1;
}
import { performance } from "node:perf_hooks";
import process from "node:process";
import { URL } from "node:url";
