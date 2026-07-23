import { z } from "zod";

import type { CachePolicy } from "./cache.js";

const positiveInteger = z.coerce.number().int().positive();

export type ProviderConfig = {
  userAgent: string;
  timeoutMs: number;
  retries: number;
  hiscoresUrl: string;
  geUrl: string;
  hiscoresCache: CachePolicy;
  geCache: CachePolicy;
};

function envInteger(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  return positiveInteger.parse(environment[name] ?? fallback);
}

export function loadProviderConfig(environment: NodeJS.ProcessEnv = process.env): ProviderConfig {
  return {
    userAgent:
      environment.GIELINOR_USER_AGENT ??
      "Gielinor-Companion-MCP/0.1.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
    timeoutMs: envInteger(environment, "GIELINOR_HTTP_TIMEOUT_MS", 10_000),
    retries: z.coerce
      .number()
      .int()
      .min(0)
      .max(5)
      .parse(environment.GIELINOR_HTTP_RETRIES ?? 2),
    hiscoresUrl:
      environment.GIELINOR_HISCORES_URL ?? "https://secure.runescape.com/m=hiscore/index_lite.ws",
    geUrl:
      environment.GIELINOR_GE_URL ??
      "https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json",
    hiscoresCache: {
      freshForMs: envInteger(environment, "GIELINOR_HISCORES_TTL_MS", 15 * 60_000),
      staleForMs: envInteger(environment, "GIELINOR_HISCORES_STALE_MS", 60 * 60_000),
    },
    geCache: {
      freshForMs: envInteger(environment, "GIELINOR_GE_TTL_MS", 5 * 60_000),
      staleForMs: envInteger(environment, "GIELINOR_GE_STALE_MS", 60 * 60_000),
    },
  };
}
