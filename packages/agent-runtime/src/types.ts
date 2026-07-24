import type { CompanionToolName } from "@gielinor/shared-types";

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AgentToolCall[] }
  | { role: "tool"; content: string; toolCallId: string; toolName: string };

export type ProviderTool = {
  type: "function";
  function: {
    name: CompanionToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ModelRequest = {
  model: string;
  messages: AgentMessage[];
  tools: ProviderTool[];
  timeoutMs: number;
};

export type ModelResponse = {
  content: string;
  toolCalls: AgentToolCall[];
  finishReason?: string;
};

export type LocalModelProvider = {
  readonly id: "ollama" | "lm-studio";
  readonly displayName: string;
  readonly capabilities: {
    modelDiscovery: boolean;
    parallelToolCalls: boolean;
  };
  discoverModels(timeoutMs: number): Promise<string[]>;
  chat(request: ModelRequest): Promise<ModelResponse>;
};

export type ToolExecutionContext = {
  signal: AbortSignal;
};

export type CompanionToolExecutor = (
  name: CompanionToolName,
  arguments_: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<unknown>;

export type AgentActivity = {
  id: string;
  toolName: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  completedAt?: string;
  message: string;
};

export type AgentRunOptions = {
  prompt: string;
  context?: string;
  history?: AgentMessage[];
  model: string;
  timeoutMs: number;
  maxToolLoops: number;
  onActivity?: (activity: AgentActivity) => void;
};

export type AgentRunResult = {
  answer: string;
  messages: AgentMessage[];
  activities: AgentActivity[];
  toolLoops: number;
};

export type JsonTransportRequest = {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  timeoutMs: number;
};

export type JsonTransportResponse = {
  status: number;
  body: unknown;
};

export type JsonTransport = {
  request(request: JsonTransportRequest): Promise<JsonTransportResponse>;
};
