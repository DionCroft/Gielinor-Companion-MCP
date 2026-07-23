import { z } from "zod";

import { LocalAiError } from "./errors.js";
import { normalizeLoopbackEndpoint } from "./transport.js";
import type {
  AgentMessage,
  AgentToolCall,
  JsonTransport,
  LocalModelProvider,
  ModelRequest,
  ModelResponse,
} from "./types.js";

const OllamaModelsSchema = z
  .object({
    models: z.array(
      z
        .object({
          name: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const OllamaChatSchema = z
  .object({
    message: z
      .object({
        content: z.string().optional().default(""),
        tool_calls: z
          .array(
            z
              .object({
                id: z.string().optional(),
                function: z
                  .object({
                    name: z.string().min(1),
                    arguments: z.unknown(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          )
          .optional()
          .default([]),
      })
      .passthrough(),
    done_reason: z.string().optional(),
  })
  .passthrough();

const OllamaShowSchema = z
  .object({
    capabilities: z.array(z.string()).default([]),
  })
  .passthrough();

const LmStudioModelsSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const LmStudioChatSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().nullable().optional(),
            message: z
              .object({
                content: z.string().nullable().optional(),
                tool_calls: z
                  .array(
                    z
                      .object({
                        id: z.string().min(1),
                        function: z
                          .object({
                            name: z.string().min(1),
                            arguments: z.string(),
                          })
                          .passthrough(),
                      })
                      .passthrough(),
                  )
                  .optional()
                  .default([]),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

function providerHttpError(status: number, body: unknown): never {
  const safeBody = JSON.stringify(body).toLocaleLowerCase();
  if (
    status === 404 ||
    (status === 400 &&
      (safeBody.includes("model") ||
        safeBody.includes("load") ||
        safeBody.includes("support chat") ||
        safeBody.includes("embedding")))
  ) {
    throw new LocalAiError(
      "MODEL_UNAVAILABLE",
      "The selected model is not loaded or installed. Choose an available model and try again.",
      true,
    );
  }
  throw new LocalAiError(
    "PROVIDER_UNAVAILABLE",
    `The local model server rejected the request with HTTP ${String(status)}.`,
    status >= 500,
  );
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new LocalAiError(
      "MALFORMED_TOOL_CALL",
      "The model emitted malformed JSON for a tool call. Try another model or rephrase the request.",
      true,
    );
  }
}

function ollamaMessages(messages: AgentMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_name: message.toolName,
      };
    }
    if (message.role === "assistant" && message.toolCalls !== undefined) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function openAiMessages(messages: AgentMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }
    if (message.role === "assistant" && message.toolCalls !== undefined) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

export class OllamaProvider implements LocalModelProvider {
  public readonly id = "ollama" as const;
  public readonly displayName = "Ollama";
  public readonly capabilities = { modelDiscovery: true, parallelToolCalls: true };
  private readonly endpoint: string;
  private readonly transport: JsonTransport;
  private callSequence = 0;

  public constructor(endpoint: string, transport: JsonTransport) {
    this.endpoint = normalizeLoopbackEndpoint(endpoint);
    this.transport = transport;
  }

  public async discoverModels(timeoutMs: number): Promise<string[]> {
    const response = await this.transport.request({
      url: `${this.endpoint}/api/tags`,
      method: "GET",
      timeoutMs,
    });
    if (response.status < 200 || response.status >= 300) {
      providerHttpError(response.status, response.body);
    }
    const parsed = OllamaModelsSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new LocalAiError(
        "PROVIDER_RESPONSE_INVALID",
        "Ollama returned an invalid model list. Update Ollama and try again.",
      );
    }
    const installed = [...new Set(parsed.data.models.map((model) => model.name))].sort();
    const toolCapable: string[] = [];
    const perModelTimeout = Math.max(1_000, Math.floor(timeoutMs / Math.max(installed.length, 1)));
    for (const model of installed) {
      const details = await this.transport.request({
        url: `${this.endpoint}/api/show`,
        method: "POST",
        body: { model, verbose: false },
        timeoutMs: perModelTimeout,
      });
      if (details.status < 200 || details.status >= 300) {
        providerHttpError(details.status, details.body);
      }
      const shown = OllamaShowSchema.safeParse(details.body);
      if (!shown.success) {
        throw new LocalAiError(
          "PROVIDER_RESPONSE_INVALID",
          "Ollama returned invalid model capability metadata. Update Ollama and try again.",
        );
      }
      if (shown.data.capabilities.includes("tools")) {
        toolCapable.push(model);
      }
    }
    return toolCapable;
  }

  public async chat(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.transport.request({
      url: `${this.endpoint}/api/chat`,
      method: "POST",
      body: {
        model: request.model,
        messages: ollamaMessages(request.messages),
        tools: request.tools,
        stream: false,
      },
      timeoutMs: request.timeoutMs,
    });
    if (response.status < 200 || response.status >= 300) {
      providerHttpError(response.status, response.body);
    }
    const parsed = OllamaChatSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new LocalAiError(
        "PROVIDER_RESPONSE_INVALID",
        "Ollama returned an incomplete or invalid chat response.",
        true,
      );
    }
    const toolCalls: AgentToolCall[] = parsed.data.message.tool_calls.map((call, index) => ({
      id: call.id ?? `ollama-call-${String(++this.callSequence)}-${String(index + 1)}`,
      name: call.function.name,
      arguments: parseArguments(call.function.arguments),
    }));
    return {
      content: parsed.data.message.content,
      toolCalls,
      ...(parsed.data.done_reason === undefined ? {} : { finishReason: parsed.data.done_reason }),
    };
  }
}

export class LmStudioProvider implements LocalModelProvider {
  public readonly id = "lm-studio" as const;
  public readonly displayName = "LM Studio";
  public readonly capabilities = { modelDiscovery: true, parallelToolCalls: true };
  private readonly endpoint: string;
  private readonly transport: JsonTransport;

  public constructor(endpoint: string, transport: JsonTransport) {
    this.endpoint = normalizeLoopbackEndpoint(endpoint);
    this.transport = transport;
  }

  public async discoverModels(timeoutMs: number): Promise<string[]> {
    const response = await this.transport.request({
      url: `${this.endpoint}/v1/models`,
      method: "GET",
      timeoutMs,
    });
    if (response.status < 200 || response.status >= 300) {
      providerHttpError(response.status, response.body);
    }
    const parsed = LmStudioModelsSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new LocalAiError(
        "PROVIDER_RESPONSE_INVALID",
        "LM Studio returned an invalid model list. Start its local server and try again.",
      );
    }
    return [...new Set(parsed.data.data.map((model) => model.id))].sort();
  }

  public async chat(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.transport.request({
      url: `${this.endpoint}/v1/chat/completions`,
      method: "POST",
      body: {
        model: request.model,
        messages: openAiMessages(request.messages),
        tools: request.tools,
        tool_choice: "auto",
        parallel_tool_calls: true,
        stream: false,
      },
      timeoutMs: request.timeoutMs,
    });
    if (response.status < 200 || response.status >= 300) {
      providerHttpError(response.status, response.body);
    }
    const parsed = LmStudioChatSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new LocalAiError(
        "PROVIDER_RESPONSE_INVALID",
        "LM Studio returned an incomplete or invalid chat response.",
        true,
      );
    }
    const choice = parsed.data.choices[0]!;
    return {
      content: choice.message.content ?? "",
      toolCalls: choice.message.tool_calls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseArguments(call.function.arguments),
      })),
      ...(choice.finish_reason === null || choice.finish_reason === undefined
        ? {}
        : { finishReason: choice.finish_reason }),
    };
  }
}
