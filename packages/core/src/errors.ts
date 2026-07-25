import {
  createGielinorError,
  mapLegacyErrorCode,
  type GielinorError,
  type GielinorErrorCode,
  type GielinorErrorSeverity,
} from "@gielinor/shared-types";

export type CompanionErrorOptions = ErrorOptions & {
  gielinorCode?: GielinorErrorCode;
  source?: string;
  operation?: string;
  userMessage?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  recoverable?: boolean;
  severity?: GielinorErrorSeverity;
  details?: Record<string, unknown>;
};

export class CompanionError extends Error {
  public readonly gielinorError: GielinorError;

  public constructor(
    message: string,
    public readonly code: string,
    options?: CompanionErrorOptions,
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CompanionError";
    this.gielinorError = createGielinorError(options?.gielinorCode ?? mapLegacyErrorCode(code), {
      message,
      userMessage: options?.userMessage,
      source: options?.source ?? "core",
      operation: options?.operation,
      retryable: options?.retryable,
      retryAfterMs: options?.retryAfterMs,
      recoverable: options?.recoverable,
      severity: options?.severity,
      details: options?.details,
      legacyCode: code,
    });
  }
}

export class NotFoundError extends CompanionError {
  public constructor(resource: string) {
    super(`${resource} was not found`, "NOT_FOUND", {
      gielinorCode: "GC-DATA-002",
      userMessage: "The requested companion record was not found.",
    });
    this.name = "NotFoundError";
  }
}

export class NotImplementedError extends CompanionError {
  public constructor(capability: string) {
    super(`${capability} is not implemented in this release`, "NOT_IMPLEMENTED", {
      gielinorCode: "GC-CFG-003",
      userMessage: "This capability is not available in the installed release.",
    });
    this.name = "NotImplementedError";
  }
}
