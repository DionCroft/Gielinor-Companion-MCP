import {
  toGielinorError,
  type GielinorError,
  type GielinorErrorCode,
} from "@gielinor/shared-types";

export function overlayError(
  error: unknown,
  operation: string,
  fallbackCode: GielinorErrorCode = "GC-DATA-001",
): GielinorError {
  return toGielinorError(error, {
    fallbackCode,
    source: "alt1-overlay",
    operation,
  });
}

export function overlayErrorMessage(
  error: unknown,
  operation: string,
  fallbackCode?: GielinorErrorCode,
): string {
  const failure = overlayError(error, operation, fallbackCode);
  return `${failure.userMessage} (${failure.code}; ${failure.traceId})`;
}
