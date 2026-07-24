import process from "node:process";

import {
  FetchJsonTransport,
  LmStudioProvider,
  LocalAiError,
  OllamaProvider,
} from "../packages/agent-runtime/dist/index.js";

const providerId = process.argv[2];
const timeoutMs = Number.parseInt(process.env.GIELINOR_AI_SMOKE_TIMEOUT_MS ?? "60000", 10);
const transport = new FetchJsonTransport();

let provider;
let configuredModel;
if (providerId === "ollama") {
  provider = new OllamaProvider(
    process.env.GIELINOR_OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434",
    transport,
  );
  configuredModel = process.env.GIELINOR_OLLAMA_MODEL;
} else if (providerId === "lm-studio") {
  provider = new LmStudioProvider(
    process.env.GIELINOR_LM_STUDIO_ENDPOINT ?? "http://127.0.0.1:1234",
    transport,
  );
  configuredModel = process.env.GIELINOR_LM_STUDIO_MODEL;
} else {
  process.stderr.write("Usage: node scripts/run-local-ai-smoke.mjs <ollama|lm-studio>\n");
  process.exit(1);
}

try {
  const models = await provider.discoverModels(timeoutMs);
  if (models.length === 0) {
    throw new LocalAiError(
      "MODEL_UNAVAILABLE",
      `${provider.displayName} is reachable but reported no tool-capable models.`,
    );
  }
  const model = configuredModel ?? models[0];
  if (!models.includes(model)) {
    throw new LocalAiError(
      "MODEL_UNAVAILABLE",
      `Configured smoke-test model ${model} was not reported by ${provider.displayName}.`,
    );
  }
  const response = await provider.chat({
    model,
    messages: [
      {
        role: "system",
        content: "Reply with a short acknowledgement. Do not call a tool.",
      },
      { role: "user", content: "Gielinor Companion local provider smoke test." },
    ],
    tools: [],
    timeoutMs,
  });
  if (response.content.trim() === "" || response.toolCalls.length !== 0) {
    throw new LocalAiError(
      "PROVIDER_RESPONSE_INVALID",
      `${provider.displayName} did not return a complete text response.`,
    );
  }
  process.stdout.write(
    `${provider.displayName} live smoke passed with ${model}; ${String(models.length)} model(s) discovered.\n`,
  );
} catch (error) {
  const code = error instanceof LocalAiError ? error.code : "UNCLASSIFIED_FAILURE";
  const message =
    error instanceof Error ? error.message : "The local provider smoke test failed unexpectedly.";
  process.stderr.write(`${provider.displayName} live smoke failed [${code}]: ${message}\n`);
  process.exitCode = 1;
}
