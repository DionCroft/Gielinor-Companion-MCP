import {
  COMPANION_TOOL_DEFINITIONS,
  ToolEnvelopeSchema,
  isCompanionToolName,
  type CompanionToolName,
} from "@gielinor/shared-types";
import { z } from "zod";

import { LocalAiError, publicError } from "./errors.js";
import { parseToolArguments, PROVIDER_TOOLS } from "./tool-registry.js";
import type {
  AgentActivity,
  AgentMessage,
  AgentRunOptions,
  AgentRunResult,
  AgentToolCall,
  CompanionToolExecutor,
  LocalModelProvider,
} from "./types.js";

const MAX_HISTORY_MESSAGES = 100;
const MAX_PROMPT_CHARACTERS = 20_000;
const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_TOOL_RESULT_BYTES = 1024 * 1024;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_TOOL_LOOPS = 10;

const MessageHistorySchema = z
  .array(
    z.union([
      z.object({ role: z.enum(["system", "user"]), content: z.string() }).strict(),
      z
        .object({
          role: z.literal("assistant"),
          content: z.string(),
          toolCalls: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  name: z.string().min(1),
                  arguments: z.unknown(),
                })
                .strict(),
            )
            .optional(),
        })
        .strict(),
      z
        .object({
          role: z.literal("tool"),
          content: z.string(),
          toolCallId: z.string().min(1),
          toolName: z.string().min(1),
        })
        .strict(),
    ]),
  )
  .max(MAX_HISTORY_MESSAGES);

const SYSTEM_PROMPT =
  "You are Gielinor Companion, a read-only RuneScape 3 planning assistant. " +
  "Use the supplied trusted tools for player facts, quests, XP, training, and prices. " +
  "Deterministic tool results are authoritative. Never invent a successful tool call, current " +
  "price, player stat, or completion. Clearly label uncertainty and never promise trading profit. " +
  "Never suggest gameplay automation, input simulation, credential collection, or anti-cheat bypass.";

function validateOptions(options: AgentRunOptions): void {
  if (options.prompt.trim() === "" || options.prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new LocalAiError(
      "INVALID_PROMPT",
      `Enter a question between 1 and ${String(MAX_PROMPT_CHARACTERS)} characters.`,
    );
  }
  if (options.model.trim() === "") {
    throw new LocalAiError("INVALID_CONFIGURATION", "Select an installed local model.");
  }
  if (options.context !== undefined && options.context.length > 2_000) {
    throw new LocalAiError(
      "INVALID_CONFIGURATION",
      "The trusted local conversation context exceeded its safety limit.",
    );
  }
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < MIN_TIMEOUT_MS ||
    options.timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new LocalAiError(
      "INVALID_CONFIGURATION",
      "Choose a request timeout between 1 and 120 seconds.",
    );
  }
  if (
    !Number.isInteger(options.maxToolLoops) ||
    options.maxToolLoops < 1 ||
    options.maxToolLoops > MAX_TOOL_LOOPS
  ) {
    throw new LocalAiError(
      "INVALID_CONFIGURATION",
      "Choose a maximum tool-loop count between 1 and 10.",
    );
  }
  if (!MessageHistorySchema.safeParse(options.history ?? []).success) {
    throw new LocalAiError(
      "INVALID_CONFIGURATION",
      "The local conversation state is invalid. Reset the conversation and try again.",
    );
  }
}

function toolErrorPayload(error: LocalAiError): string {
  return JSON.stringify({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  });
}

function safeToolOutput(output: unknown): string {
  const parsed = ToolEnvelopeSchema.safeParse(output);
  if (!parsed.success) {
    throw new LocalAiError(
      "INVALID_TOOL_OUTPUT",
      "The companion tool returned an invalid result, so it was not given to the model.",
    );
  }
  const content = JSON.stringify({ ok: true, result: parsed.data });
  if (new TextEncoder().encode(content).byteLength > MAX_TOOL_RESULT_BYTES) {
    throw new LocalAiError(
      "INVALID_TOOL_OUTPUT",
      "The companion tool result exceeded the model safety limit.",
    );
  }
  return content;
}

function remainingTime(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new LocalAiError(
      "TIMEOUT",
      "The local AI request reached its configured overall timeout.",
      true,
    );
  }
  return remaining;
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadline: number,
): Promise<T> {
  const controller = new AbortController();
  const wait = remainingTime(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort();
      reject(
        new LocalAiError(
          "TIMEOUT",
          "The local AI request reached its configured overall timeout.",
          true,
        ),
      );
    }, wait);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
    }
    controller.abort();
  }
}

type ToolExecutionResult = {
  message: AgentMessage;
  activity: AgentActivity;
};

export class LocalAgentRuntime {
  private readonly provider: LocalModelProvider;
  private readonly executeTool: CompanionToolExecutor;

  public constructor(provider: LocalModelProvider, executeTool: CompanionToolExecutor) {
    this.provider = provider;
    this.executeTool = executeTool;
  }

  private async executeOne(
    call: AgentToolCall,
    deadline: number,
    onActivity?: (activity: AgentActivity) => void,
  ): Promise<ToolExecutionResult> {
    const startedAt = new Date().toISOString();
    const running: AgentActivity = {
      id: call.id,
      toolName: call.name,
      status: "running",
      startedAt,
      message: "Validating trusted tool call",
    };
    onActivity?.(running);

    let toolName: CompanionToolName | undefined;
    let content: string;
    let failure: LocalAiError | undefined;
    try {
      if (!isCompanionToolName(call.name)) {
        throw new LocalAiError(
          "UNKNOWN_TOOL",
          "The model requested an unknown capability. No tool was run.",
        );
      }
      toolName = call.name;
      let arguments_: Record<string, unknown>;
      try {
        arguments_ = parseToolArguments(toolName, call.arguments);
      } catch {
        throw new LocalAiError(
          "INVALID_TOOL_ARGUMENTS",
          `The model supplied invalid arguments for ${toolName}. No tool was run.`,
          true,
        );
      }
      const output = await withDeadline(
        (signal) => this.executeTool(toolName!, arguments_, { signal }),
        deadline,
      );
      content = safeToolOutput(output);
    } catch (error) {
      failure = publicError(error);
      content = toolErrorPayload(failure);
    }

    const activity: AgentActivity = {
      ...running,
      status: failure === undefined ? "succeeded" : "failed",
      completedAt: new Date().toISOString(),
      message:
        failure?.message ??
        `${COMPANION_TOOL_DEFINITIONS[toolName!].effect === "local-state" ? "Local companion state updated" : "Validated result returned"}`,
    };
    onActivity?.(activity);
    return {
      message: {
        role: "tool",
        content,
        toolCallId: call.id,
        toolName: call.name,
      },
      activity,
    };
  }

  public async run(options: AgentRunOptions): Promise<AgentRunResult> {
    validateOptions(options);
    const deadline = Date.now() + options.timeoutMs;
    const previous = MessageHistorySchema.parse(options.history ?? []) as AgentMessage[];
    const messages: AgentMessage[] =
      previous.length === 0
        ? [
            { role: "system", content: SYSTEM_PROMPT },
            ...(options.context === undefined || options.context.trim() === ""
              ? []
              : [{ role: "system" as const, content: options.context.trim() }]),
          ]
        : [...previous];
    messages.push({ role: "user", content: options.prompt.trim() });

    const activities: AgentActivity[] = [];
    let toolLoops = 0;
    while (true) {
      const response = await withDeadline(
        () =>
          this.provider.chat({
            model: options.model,
            messages,
            tools: PROVIDER_TOOLS,
            timeoutMs: remainingTime(deadline),
          }),
        deadline,
      );
      if (response.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
        throw new LocalAiError(
          "MALFORMED_TOOL_CALL",
          `The model requested more than ${String(MAX_TOOL_CALLS_PER_TURN)} tools at once.`,
        );
      }
      if (response.toolCalls.length === 0) {
        if (response.content.trim() === "") {
          throw new LocalAiError(
            "PROVIDER_RESPONSE_INVALID",
            "The local model returned no answer. Try another model or rephrase the request.",
            true,
          );
        }
        messages.push({ role: "assistant", content: response.content });
        return {
          answer: response.content,
          messages,
          activities,
          toolLoops,
        };
      }
      if (toolLoops >= options.maxToolLoops) {
        throw new LocalAiError(
          "LOOP_LIMIT_REACHED",
          "The model reached the configured tool-loop limit before producing an answer.",
          true,
        );
      }
      toolLoops += 1;
      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      const execute = (call: AgentToolCall) => this.executeOne(call, deadline, options.onActivity);
      const results = this.provider.capabilities.parallelToolCalls
        ? await Promise.all(response.toolCalls.map(execute))
        : await response.toolCalls.reduce<Promise<ToolExecutionResult[]>>(
            async (pending, call) => [...(await pending), await execute(call)],
            Promise.resolve([]),
          );
      for (const result of results) {
        messages.push(result.message);
        activities.push(result.activity);
      }
    }
  }
}
