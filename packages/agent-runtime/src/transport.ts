import { LocalAiError } from "./errors.js";
import type { JsonTransport, JsonTransportRequest, JsonTransportResponse } from "./types.js";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function normalizeLoopbackEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new LocalAiError(
      "INVALID_CONFIGURATION",
      "Enter a valid local provider URL, such as http://127.0.0.1:11434.",
    );
  }
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    endpoint.protocol !== "http:" ||
    !loopbackHosts.has(endpoint.hostname) ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  ) {
    throw new LocalAiError(
      "INVALID_CONFIGURATION",
      "Local-only privacy mode accepts only loopback HTTP endpoints without credentials or query strings.",
    );
  }
  return endpoint.toString().replace(/\/$/, "");
}

function encodedLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class FetchJsonTransport implements JsonTransport {
  public async request(request: JsonTransportRequest): Promise<JsonTransportResponse> {
    if (request.body !== undefined && encodedLength(request.body) > MAX_REQUEST_BYTES) {
      throw new LocalAiError(
        "INVALID_CONFIGURATION",
        "The local model request exceeded the one-megabyte safety limit.",
      );
    }

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new LocalAiError(
          "PROVIDER_RESPONSE_INVALID",
          "The local model returned an unexpectedly large response.",
        );
      }
      if (text.trim() === "") {
        return { status: response.status, body: null };
      }
      try {
        return { status: response.status, body: JSON.parse(text) as unknown };
      } catch {
        throw new LocalAiError(
          "PROVIDER_RESPONSE_INVALID",
          "The local model returned malformed JSON. Check that its API server is compatible.",
        );
      }
    } catch (error) {
      if (error instanceof LocalAiError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new LocalAiError(
          "TIMEOUT",
          "The local model did not respond before the configured timeout.",
          true,
        );
      }
      throw new LocalAiError(
        "PROVIDER_UNAVAILABLE",
        "The local model server could not be reached. Start it and confirm the endpoint.",
        true,
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}
