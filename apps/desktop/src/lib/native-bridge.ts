import {
  LocalAiError,
  type JsonTransport,
  type JsonTransportRequest,
  type JsonTransportResponse,
} from "@gielinor/agent-runtime";
import { invoke, isTauri } from "@tauri-apps/api/core";

import type { CompanionBridge, RuntimeStatus, ToolEnvelope } from "../types.js";

class TauriJsonTransport implements JsonTransport {
  public async request(request: JsonTransportRequest): Promise<JsonTransportResponse> {
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    if (body !== undefined && new TextEncoder().encode(body).byteLength > 1024 * 1024) {
      throw new LocalAiError(
        "INVALID_CONFIGURATION",
        "The local model request exceeded the one-megabyte safety limit.",
      );
    }
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
      const response = await nativeFetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
        connectTimeout: request.timeoutMs,
        maxRedirections: 0,
      });
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) {
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
        throw new LocalAiError("TIMEOUT", "The local model did not respond in time.", true);
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

export class TauriCompanionBridge implements CompanionBridge {
  public async runtimeStatus(): Promise<RuntimeStatus> {
    return invoke<RuntimeStatus>("desktop_runtime_status");
  }

  public async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    return invoke<ToolEnvelope<T>>("call_companion_tool", {
      tool,
      arguments: arguments_,
    });
  }

  public localAiTransport(): JsonTransport {
    return new TauriJsonTransport();
  }
}

export class BrowserLiveDevelopmentBridge implements CompanionBridge {
  public async runtimeStatus(): Promise<RuntimeStatus> {
    return {
      ready: false,
      mode: "browser-live-development",
      transport: "unavailable",
      message:
        "Browser live-development is not connected to the local MCP and SQLite runtime. Run `corepack pnpm desktop:dev` for real functionality. Preview data requires the explicit preview build.",
    };
  }

  public async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    void arguments_;
    if (tool === "list_player_profiles") {
      return {
        data: [] as T,
        meta: {
          generatedAt: new Date().toISOString(),
          source: "unavailable: browser live-development has no local MCP connection",
          provenance: {
            origin: "unavailable",
            provider: "browser live-development",
            timestamp: new Date().toISOString(),
            freshness: "unknown",
            cacheState: "not-applicable",
            warnings: ["Use the native desktop runtime for real companion data."],
          },
        },
      };
    }
    throw new Error(
      "Real companion tools are unavailable in a standalone browser. Run `corepack pnpm desktop:dev` to use the native MCP and SQLite bridge.",
    );
  }

  public localAiTransport(): JsonTransport {
    return {
      request: async () => ({
        status: 503,
        body: {
          error:
            "Local AI is unavailable in standalone browser mode; use the native desktop runtime.",
        },
      }),
    };
  }
}

export function createDefaultBridge(): CompanionBridge {
  return isTauri() ? new TauriCompanionBridge() : new BrowserLiveDevelopmentBridge();
}
