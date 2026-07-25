import {
  createGielinorError,
  type GielinorError,
  type GielinorErrorCode,
} from "@gielinor/shared-types";

export type LocalAiErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_PROMPT"
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "PROVIDER_RESPONSE_INVALID"
  | "MALFORMED_TOOL_CALL"
  | "UNKNOWN_TOOL"
  | "INVALID_TOOL_ARGUMENTS"
  | "INVALID_TOOL_OUTPUT"
  | "TOOL_FAILED"
  | "LOOP_LIMIT_REACHED"
  | "TIMEOUT";

const STABLE_LOCAL_AI_CODES: Readonly<Record<LocalAiErrorCode, GielinorErrorCode>> = {
  INVALID_CONFIGURATION: "GC-CFG-001",
  INVALID_PROMPT: "GC-SEC-003",
  PROVIDER_UNAVAILABLE: "GC-AI-001",
  MODEL_UNAVAILABLE: "GC-AI-002",
  PROVIDER_RESPONSE_INVALID: "GC-PROVIDER-003",
  MALFORMED_TOOL_CALL: "GC-AI-003",
  UNKNOWN_TOOL: "GC-MCP-002",
  INVALID_TOOL_ARGUMENTS: "GC-AI-003",
  INVALID_TOOL_OUTPUT: "GC-MCP-004",
  TOOL_FAILED: "GC-MCP-003",
  LOOP_LIMIT_REACHED: "GC-AI-004",
  TIMEOUT: "GC-AI-005",
};

export class LocalAiError extends Error {
  public readonly code: LocalAiErrorCode;
  public readonly retryable: boolean;
  public readonly gielinorError: GielinorError;

  public constructor(code: LocalAiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "LocalAiError";
    this.code = code;
    this.retryable = retryable;
    this.gielinorError = createGielinorError(STABLE_LOCAL_AI_CODES[code], {
      message,
      source: "agent-runtime",
      retryable,
      legacyCode: code,
    });
  }
}

export function publicError(error: unknown): LocalAiError {
  if (error instanceof LocalAiError) {
    return error;
  }
  return new LocalAiError(
    "TOOL_FAILED",
    "The trusted companion tool could not complete the request. Review its inputs and try again.",
    true,
  );
}
