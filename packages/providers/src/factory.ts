import type { CacheStore } from "./cache.js";
import { createBuiltinProviderPlugin } from "./builtin-plugin.js";
import type { ProviderConfig } from "./config.js";
import { ResilientHttpClient } from "./http.js";
import { JagexGrandExchangeProvider } from "./jagex-ge.js";
import { JagexHiscoresProvider } from "./jagex-hiscores.js";
import { ProviderPortAdapter, ProviderRegistry } from "./plugin.js";
import { RuneScapeWikiQuestProvider } from "./runescape-wiki-quests.js";
import { RuneScapeWikiTrainingProvider } from "./runescape-wiki-training.js";
import { WeirdGloopExchangeHistoryProvider } from "./weird-gloop-exchange.js";
import { WeirdGloopRuneScapeNewsProvider } from "./weird-gloop-news.js";

export type DefaultProviderStack = {
  registry: ProviderRegistry;
  ports: ProviderPortAdapter;
  marketHistory: WeirdGloopExchangeHistoryProvider;
  news: WeirdGloopRuneScapeNewsProvider;
};

export function createDefaultProviderStack(
  config: ProviderConfig,
  cacheStore: CacheStore,
): DefaultProviderStack {
  const httpClient = new ResilientHttpClient({
    userAgent: config.userAgent,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
  });
  const stats = new JagexHiscoresProvider({
    httpClient,
    cacheStore,
    cachePolicy: config.hiscoresCache,
    normalEndpoint: config.hiscoresUrl,
  });
  const prices = new JagexGrandExchangeProvider({
    httpClient,
    cacheStore,
    cachePolicy: config.geCache,
    historyCachePolicy: config.geHistoryCache,
    endpoint: config.geUrl,
    graphEndpoint: config.geGraphUrl,
    bulkEndpoint: config.geBulkUrl,
  });
  const quests = new RuneScapeWikiQuestProvider({
    httpClient,
    apiUrl: config.wikiApiUrl,
    pageUrl: config.wikiPageUrl,
  });
  const training = new RuneScapeWikiTrainingProvider({
    httpClient,
    apiUrl: config.wikiApiUrl,
    pageUrl: config.wikiPageUrl,
  });
  const marketHistory = new WeirdGloopExchangeHistoryProvider({
    httpClient,
    cacheStore,
    cachePolicy: config.geHistoryCache,
    endpoint: config.weirdGloopHistoryUrl,
  });
  const news = new WeirdGloopRuneScapeNewsProvider({
    httpClient,
    cacheStore,
    cachePolicy: config.newsCache,
    endpoint: config.newsUrl,
  });
  const registry = new ProviderRegistry();
  registry.register(createBuiltinProviderPlugin({ stats, prices, quests, training }));
  return {
    registry,
    ports: new ProviderPortAdapter(registry, config.offline),
    marketHistory,
    news,
  };
}
