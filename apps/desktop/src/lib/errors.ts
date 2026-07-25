import {
  toGielinorError,
  type GielinorError,
  type GielinorErrorCode,
} from "@gielinor/shared-types";

export function desktopError(
  error: unknown,
  operation: string,
  fallbackCode: GielinorErrorCode = "GC-UNKNOWN-999",
): GielinorError {
  return toGielinorError(error, {
    fallbackCode,
    source: "desktop",
    operation,
  });
}
