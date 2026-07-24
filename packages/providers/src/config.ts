import { z } from "zod";

import type { CachePolicy } from "./cache.js";

const positiveInteger = z.coerce.number().int().positive();

export type ProviderConfig = {
  userAgent: string;
  offline: boolean;
  timeoutMs: number;
  retries: number;
  hiscoresUrl: string;
  geUrl: string;
  geGraphUrl: string;
  geBulkUrl: string;
  wikiApiUrl: string;
  wikiPageUrl: string;
  hiscoresCache: CachePolicy;
  geCache: CachePolicy;
  geHistoryCache: CachePolicy;
};

function envInteger(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  return positiveInteger.parse(environment[name] ?? fallback);
}

function envBoolean(environment: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = environment[name];
  if (value === undefined) {
    return fallback;
  }
  return z
    .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
    .transform((entry) => ["true", "1", "yes", "on"].includes(entry))
    .parse(value.toLowerCase());
}

export function loadProviderConfig(environment: NodeJS.ProcessEnv = process.env): ProviderConfig {
  return {
    userAgent:
      environment.GIELINOR_USER_AGENT ??
      "Gielinor-Companion-MCP/0.9.0 (https://github.com/DionCroft/Gielinor-Companion-MCP)",
    offline: envBoolean(environment, "GIELINOR_OFFLINE", false),
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
    geGraphUrl:
      environment.GIELINOR_GE_GRAPH_URL ?? "https://secure.runescape.com/m=itemdb_rs/api/graph/",
    geBulkUrl:
      environment.GIELINOR_GE_BULK_URL ??
      "https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json",
    wikiApiUrl: environment.GIELINOR_WIKI_API_URL ?? "https://runescape.wiki/api.php",
    wikiPageUrl: environment.GIELINOR_WIKI_PAGE_URL ?? "https://runescape.wiki/w/",
    hiscoresCache: {
      freshForMs: envInteger(environment, "GIELINOR_HISCORES_TTL_MS", 15 * 60_000),
      staleForMs: envInteger(environment, "GIELINOR_HISCORES_STALE_MS", 60 * 60_000),
    },
    geCache: {
      freshForMs: envInteger(environment, "GIELINOR_GE_TTL_MS", 5 * 60_000),
      staleForMs: envInteger(environment, "GIELINOR_GE_STALE_MS", 60 * 60_000),
    },
    geHistoryCache: {
      freshForMs: envInteger(environment, "GIELINOR_GE_HISTORY_TTL_MS", 6 * 60 * 60_000),
      staleForMs: envInteger(environment, "GIELINOR_GE_HISTORY_STALE_MS", 7 * 24 * 60 * 60_000),
    },
  };
}
