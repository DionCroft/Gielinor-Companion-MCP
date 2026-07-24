import type { OverlayObservation } from "./contracts.js";

export type SanitizedScreenText =
  | { accepted: true; text: string; redactions: number }
  | {
      accepted: false;
      reason: "empty" | "player-chat" | "private-chat" | "unsupported";
    };

const TIMESTAMP_PREFIX = /^\[\d{1,2}:\d{2}(?::\d{2})?]\s*/;
const PRIVATE_CHAT_PREFIX = /^(?:from|to)\s+[a-z0-9 _-]{1,20}:/i;
const PLAYER_CHAT_PREFIX = /^[a-z0-9 _-]{1,20}:\s+/i;
const SAFE_SYSTEM_PREFIX =
  /^(?:quest (?:complete|completed|started)|objective|adventure|task|journal|game message):\s+/i;
const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const LONG_IDENTIFIER = /\b[a-z0-9_-]{32,}\b/gi;

function removeControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");
}

export function sanitizeVisibleText(
  text: string,
  source: OverlayObservation["source"],
): SanitizedScreenText {
  let candidate = removeControlCharacters(text).trim();
  if (candidate.length === 0) {
    return { accepted: false, reason: "empty" };
  }

  candidate = candidate.replace(TIMESTAMP_PREFIX, "").trim();
  if (source === "alt1-visible-chat" && PRIVATE_CHAT_PREFIX.test(candidate)) {
    return { accepted: false, reason: "private-chat" };
  }
  if (
    source === "alt1-visible-chat" &&
    PLAYER_CHAT_PREFIX.test(candidate) &&
    !SAFE_SYSTEM_PREFIX.test(candidate)
  ) {
    return { accepted: false, reason: "player-chat" };
  }

  let redactions = 0;
  const redact = (value: string, pattern: RegExp, replacement: string): string =>
    value.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });

  candidate = redact(candidate, EMAIL, "[email redacted]");
  candidate = redact(candidate, URL, "[link redacted]");
  candidate = redact(candidate, IPV4, "[address redacted]");
  candidate = redact(candidate, LONG_IDENTIFIER, "[identifier redacted]");
  candidate = candidate.replace(/\s+/g, " ").trim().slice(0, 280);

  if (candidate.length < 2) {
    return { accepted: false, reason: "unsupported" };
  }
  return { accepted: true, text: candidate, redactions };
}
