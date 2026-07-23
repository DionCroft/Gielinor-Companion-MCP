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

export class LocalAiError extends Error {
  public readonly code: LocalAiErrorCode;
  public readonly retryable: boolean;

  public constructor(code: LocalAiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "LocalAiError";
    this.code = code;
    this.retryable = retryable;
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
