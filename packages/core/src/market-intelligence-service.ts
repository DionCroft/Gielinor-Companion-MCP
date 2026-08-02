import {
  MARKET_STRATEGY_CONFIGURATION_V1,
  ManualGeOrderPlanSchema,
  MarketBacktestInputSchema,
  MarketBacktestResultSchema,
  MarketComponentScoresSchema,
  MarketIndicatorsSchema,
  MarketRecommendationSchema,
  PortfolioSummarySchema,
  type MarketBacktestInput,
  type MarketBacktestResult,
  type MarketComponentScores,
  type MarketHistorySeries,
  type MarketEventContext,
  type MarketIndicators,
  type MarketPreferences,
  type MarketRecommendation,
  type MarketRecommendationType,
  type PriceCatalogueItem,
} from "@gielinor/shared-types";

import { CompanionError, NotFoundError } from "./errors.js";
import type {
  MarketHistoryProvider,
  PriceRepository,
  ProviderRequestOptions,
  RuneScapeNewsProvider,
} from "./ports.js";
import type { PlayerPrivateDataService } from "./player-private-data-service.js";

const DAY_MS = 24 * 60 * 60_000;
const DISCLAIMER =
  "Manual analytical signal using public RS3 guide-price history; it is not a guaranteed instant-trade price and no Grand Exchange offer is placed.";
const EVENT_CORRELATION_DISCLAIMER =
  "The published update mentions this item; correlation does not prove that it caused a market move." as const;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function safe(value: number, context: string): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) {
    throw new CompanionError(`${context} exceeds the safe GP range`, "NUMERIC_OVERFLOW");
  }
  return rounded;
}

function mean(values: number[]): number | undefined {
  return values.length === 0
    ? undefined
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function standardDeviation(values: number[]): number | undefined {
  const average = mean(values);
  if (average === undefined || values.length < 2) return undefined;
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1),
  );
}

function last(values: number[], count: number): number[] {
  return values.slice(Math.max(0, values.length - count));
}

function percentageChange(current: number, previous: number | undefined): number | undefined {
  return previous === undefined || previous === 0
    ? undefined
    : round(((current - previous) / previous) * 100);
}

function pointAtOrBefore(
  series: MarketHistorySeries,
  daysBeforeLatest: number,
): number | undefined {
  const latestTime = Date.parse(series.points.at(-1)?.timestamp ?? "");
  const target = latestTime - daysBeforeLatest * DAY_MS;
  return [...series.points].reverse().find((point) => Date.parse(point.timestamp) <= target)?.price;
}

function weighted(scores: Array<[number, number]>): number {
  const totalWeight = scores.reduce((total, [, weight]) => total + weight, 0);
  return round(scores.reduce((total, [value, weight]) => total + value * weight, 0) / totalWeight);
}

function scoreComponent(score: number, ...reasons: string[]) {
  return { score: round(clamp(score)), reasons: reasons.filter((reason) => reason !== "") };
}

export function calculateMarketIndicators(
  item: PriceCatalogueItem,
  series: MarketHistorySeries,
  comparisonSeries?: MarketHistorySeries,
): MarketIndicators {
  if (item.currentPrice === undefined) {
    throw new CompanionError("The item has no published guide price", "PRICE_UNAVAILABLE");
  }
  const prices = series.points.map((point) => point.price);
  const current = item.currentPrice;
  const latest = series.points.at(-1);
  const comparisonLatest = comparisonSeries?.points.at(-1);
  if (latest === undefined) {
    throw new CompanionError("No usable market history is available", "PRICE_HISTORY_UNAVAILABLE");
  }
  const returns = prices.slice(1).flatMap((price, index) => {
    const previous = prices[index];
    return previous === undefined || previous === 0 ? [] : [((price - previous) / previous) * 100];
  });
  const sma7 = mean(last(prices, 7));
  const sma30 = mean(last(prices, 30));
  const sma90 = mean(last(prices, 90));
  const distributionMean = mean(prices) ?? current;
  const distributionDeviation = standardDeviation(prices) ?? 0;
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const volume30 = mean(
    last(
      series.points.flatMap((point) => (point.volume === undefined ? [] : [point.volume])),
      30,
    ),
  );
  return MarketIndicatorsSchema.parse({
    currentGuidePrice: current,
    ...(item.previousPrice === undefined ? {} : { previousGuidePrice: item.previousPrice }),
    latestHistoryPrice: latest.price,
    ...(latest.volume === undefined ? {} : { latestVolume: latest.volume }),
    ...(volume30 === undefined ? {} : { averageVolume30d: round(volume30) }),
    ...(percentageChange(current, pointAtOrBefore(series, 1)) === undefined
      ? {}
      : { change1dPercent: percentageChange(current, pointAtOrBefore(series, 1)) }),
    ...(percentageChange(current, pointAtOrBefore(series, 7)) === undefined
      ? {}
      : { change7dPercent: percentageChange(current, pointAtOrBefore(series, 7)) }),
    ...(percentageChange(current, pointAtOrBefore(series, 30)) === undefined
      ? {}
      : { change30dPercent: percentageChange(current, pointAtOrBefore(series, 30)) }),
    ...(percentageChange(current, pointAtOrBefore(series, 90)) === undefined
      ? {}
      : { change90dPercent: percentageChange(current, pointAtOrBefore(series, 90)) }),
    ...(percentageChange(current, pointAtOrBefore(series, 180)) === undefined
      ? {}
      : { change180dPercent: percentageChange(current, pointAtOrBefore(series, 180)) }),
    ...(sma7 === undefined ? {} : { sma7: round(sma7) }),
    ...(sma30 === undefined ? {} : { sma30: round(sma30) }),
    ...(sma90 === undefined ? {} : { sma90: round(sma90) }),
    ...(sma30 === undefined || sma30 === 0
      ? {}
      : { priceVsSma30Percent: round(((current - sma30) / sma30) * 100) }),
    ...(standardDeviation(returns) === undefined
      ? {}
      : { dailyReturnVolatilityPercent: round(standardDeviation(returns) ?? 0) }),
    historicalHigh: high,
    historicalLow: low,
    distanceFromHighPercent: high === 0 ? 0 : round(((current - high) / high) * 100),
    distanceFromLowPercent: low === 0 ? 0 : round(((current - low) / low) * 100),
    outlierScore:
      distributionDeviation === 0 ? 0 : round((current - distributionMean) / distributionDeviation),
    providerDifferencePercent:
      (comparisonLatest?.price ?? latest.price) === 0
        ? 0
        : round(
            (Math.abs(latest.price - (comparisonLatest?.price ?? current)) /
              (comparisonLatest?.price ?? latest.price)) *
              100,
          ),
    ...(comparisonLatest === undefined
      ? {}
      : {
          comparisonHistoryPrice: comparisonLatest.price,
          comparisonHistoryTimestamp: comparisonLatest.timestamp,
          comparisonProviderName: comparisonSeries?.sourceName,
        }),
    historyPointCount: prices.length,
    ...(item.buyLimit === undefined ? {} : { buyLimit: item.buyLimit }),
    guidePriceTimestamp: item.timestamp,
    historyTimestamp: latest.timestamp,
  });
}

export function scoreMarketIndicators(
  indicators: MarketIndicators,
  preferences: MarketPreferences,
  now: number = Date.now(),
): MarketComponentScores {
  const momentum7 = indicators.change7dPercent ?? 0;
  const momentum30 = indicators.change30dPercent ?? 0;
  const vsAverage = indicators.priceVsSma30Percent ?? 0;
  const volatility = indicators.dailyReturnVolatilityPercent;
  const volume = indicators.averageVolume30d ?? indicators.latestVolume;
  const trend = clamp(
    50 +
      momentum7 * 2 +
      momentum30 +
      vsAverage * 1.5 -
      Math.max(0, indicators.outlierScore - 2) * 15,
  );
  const structuralPenalty = Math.min(30, Math.max(0, -(indicators.change90dPercent ?? 0)));
  const meanReversion = clamp(50 - vsAverage * 4 - structuralPenalty);
  const liquidity = volume === undefined ? 35 : clamp(Math.log10(Math.max(1, volume)) * 20);
  const risk = volatility === undefined ? 40 : clamp(100 - volatility * 6);
  const latestAgeHours = Math.max(0, (now - Date.parse(indicators.historyTimestamp)) / 3_600_000);
  const freshness = clamp(
    100 - latestAgeHours * (100 / (MARKET_STRATEGY_CONFIGURATION_V1.staleAfterHours * 2)),
  );
  const sourceConfidence = clamp(
    100 -
      indicators.providerDifferencePercent * 3 -
      (volume === undefined ? 10 : 0) -
      (indicators.historyPointCount < 90 ? 10 : 0),
  );
  let userFit = 75;
  const userReasons: string[] = [];
  if (
    preferences.minimumVolume !== undefined &&
    (volume === undefined || volume < preferences.minimumVolume)
  ) {
    userFit -= 35;
    userReasons.push("Published volume does not meet the profile minimum.");
  }
  if (
    preferences.maximumVolatility !== undefined &&
    (volatility === undefined || volatility > preferences.maximumVolatility)
  ) {
    userFit -= 35;
    userReasons.push("Observed volatility exceeds the profile maximum.");
  }
  if (preferences.riskTolerance === "low" && volatility !== undefined && volatility > 5)
    userFit -= 20;
  if (preferences.riskTolerance === "high" && volatility !== undefined && volatility < 12)
    userFit += 10;
  const primary =
    preferences.strategy === "mean-reversion"
      ? meanReversion
      : preferences.strategy === "balanced"
        ? (trend + meanReversion) / 2
        : trend;
  const meanReversionStrategy = preferences.strategy === "mean-reversion";
  const weights = meanReversionStrategy
    ? MARKET_STRATEGY_CONFIGURATION_V1.meanReversionWeights
    : MARKET_STRATEGY_CONFIGURATION_V1.trendWeights;
  const primaryWeight = meanReversionStrategy
    ? MARKET_STRATEGY_CONFIGURATION_V1.meanReversionWeights.meanReversion
    : MARKET_STRATEGY_CONFIGURATION_V1.trendWeights.trend;
  const overall = weighted([
    [primary, primaryWeight],
    [liquidity, weights.liquidity],
    [risk, weights.risk],
    [freshness, weights.freshness],
    [sourceConfidence, weights.confidence],
    [clamp(userFit), weights.userFit],
  ]);
  return MarketComponentScoresSchema.parse({
    trend: scoreComponent(
      trend,
      `7-day momentum is ${round(momentum7)}%; 30-day momentum is ${round(momentum30)}%.`,
    ),
    meanReversion: scoreComponent(
      meanReversion,
      `Guide price is ${round(vsAverage)}% from the 30-day average.`,
    ),
    liquidity: scoreComponent(
      liquidity,
      volume === undefined
        ? "No public volume was available; liquidity is uncertain."
        : `Published 30-day average volume is ${Math.round(volume).toLocaleString("en-GB")}.`,
    ),
    volatilityRisk: scoreComponent(
      risk,
      volatility === undefined
        ? "There is not enough history to estimate daily-return volatility."
        : `Estimated daily-return volatility is ${round(volatility)}%.`,
    ),
    freshness: scoreComponent(
      freshness,
      `Latest history observation is ${round(latestAgeHours, 1)} hour(s) old.`,
    ),
    sourceConfidence: scoreComponent(
      sourceConfidence,
      `Public provider price difference is ${round(indicators.providerDifferencePercent)}%.`,
    ),
    userFit: scoreComponent(
      userFit,
      ...(userReasons.length === 0
        ? ["The signal fits the saved market preferences."]
        : userReasons),
    ),
    overallOpportunity: scoreComponent(
      overall,
      `Versioned ${preferences.strategy} weights produce an opportunity score of ${overall}.`,
    ),
  });
}

function classification(
  indicators: MarketIndicators,
  scores: MarketComponentScores,
  preferences: MarketPreferences,
  heldQuantity: number,
  acquisitionPrice?: number,
  confidencePenalty = 0,
): MarketRecommendationType {
  const confidence = Math.max(
    0,
    Math.min(scores.freshness.score, scores.sourceConfidence.score, scores.userFit.score) -
      confidencePenalty,
  );
  const overall = scores.overallOpportunity.score;
  const volume = indicators.averageVolume30d ?? indicators.latestVolume;
  if (indicators.historyPointCount < MARKET_STRATEGY_CONFIGURATION_V1.minimumHistoryPoints)
    return "insufficient-data";
  if (
    confidence < preferences.minimumDataConfidence ||
    overall < MARKET_STRATEGY_CONFIGURATION_V1.avoidThreshold
  )
    return "avoid";
  if (heldQuantity > 0) {
    const profit =
      acquisitionPrice === undefined
        ? undefined
        : percentageChange(indicators.currentGuidePrice, acquisitionPrice);
    if (
      (profit ?? 0) > 10 &&
      indicators.outlierScore > 1.5 &&
      (indicators.change7dPercent ?? 0) < 0
    )
      return "sell-candidate";
    if (
      scores.trend.score < 30 ||
      scores.volatilityRisk.score < 20 ||
      (indicators.dailyReturnVolatilityPercent ?? 0) >=
        MARKET_STRATEGY_CONFIGURATION_V1.extremeVolatilityPercent
    )
      return "reduce";
    return "hold";
  }
  if (preferences.avoidNewOrUnstableItems && indicators.historyPointCount < 90) return "avoid";
  if (
    (indicators.dailyReturnVolatilityPercent ?? 0) >=
    MARKET_STRATEGY_CONFIGURATION_V1.extremeVolatilityPercent
  )
    return "avoid";
  if (
    preferences.minimumVolume !== undefined &&
    (volume === undefined || volume < preferences.minimumVolume)
  )
    return "avoid";
  if (overall >= MARKET_STRATEGY_CONFIGURATION_V1.strongBuyThreshold && confidence >= 75)
    return "strong-buy-candidate";
  if (overall >= MARKET_STRATEGY_CONFIGURATION_V1.buyThreshold) return "buy-candidate";
  return "watch";
}

function normaliseNewsText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceBackedEventContext(
  item: PriceCatalogueItem,
  items: Awaited<ReturnType<RuneScapeNewsProvider["fetchNews"]>>["items"],
  now: number,
): MarketEventContext[] {
  const names = [item.name, ...item.aliases]
    .map(normaliseNewsText)
    .filter((name) => name.length >= 3);
  const oldest = now - 30 * DAY_MS;
  return items.flatMap((newsItem) => {
    if (Date.parse(newsItem.publishedAt) < oldest) return [];
    const normalisedTags = newsItem.tags.map(normaliseNewsText);
    const exactSourceTag = names.some((name) => normalisedTags.includes(name));
    const normalisedTitle = ` ${normaliseNewsText(newsItem.title)} `;
    const exactTitleName = names.some((name) => normalisedTitle.includes(` ${name} `));
    if (!exactSourceTag && !exactTitleName) return [];
    return [
      {
        newsItemId: newsItem.id,
        title: newsItem.title,
        url: newsItem.url,
        publishedAt: newsItem.publishedAt,
        tags: newsItem.tags,
        matchBasis: exactSourceTag
          ? ("exact-source-tag" as const)
          : ("exact-item-name-in-title" as const),
        correlationDisclaimer: EVENT_CORRELATION_DISCLAIMER,
      },
    ];
  });
}

export class MarketIntelligenceService {
  public constructor(
    private readonly prices: PriceRepository,
    private readonly history: MarketHistoryProvider,
    private readonly privateData: PlayerPrivateDataService,
    private readonly now: () => number = Date.now,
    private readonly news?: RuneScapeNewsProvider,
    private readonly comparisonHistory?: MarketHistoryProvider,
  ) {}

  public async analyseGeItem(
    profileId: string,
    identifier: number | string,
    options: ProviderRequestOptions = {},
  ): Promise<MarketRecommendation> {
    const item = await this.prices.getByIdOrAlias(identifier);
    if (item === null) throw new NotFoundError(`Grand Exchange item ${String(identifier)}`);
    const [holdings, preferences] = await Promise.all([
      this.privateData.getHoldings(profileId),
      this.privateData.getMarketPreferences(profileId),
    ]);
    const holding = holdings?.items.find((entry) => entry.itemId === item.itemId);
    let eventContext: MarketEventContext[] = [];
    let newsRetrievedAt: string | undefined;
    let newsSourceName: string | undefined;
    let newsSourceUrl: string | undefined;
    let newsDataState: "live-public-data" | "retained-cached-data" | undefined;
    let newsUnavailable = false;
    if (this.news !== undefined) {
      try {
        const snapshot = await this.news.fetchNews(options);
        eventContext = sourceBackedEventContext(item, snapshot.items, this.now());
        if (eventContext.length > 0) {
          newsRetrievedAt = snapshot.retrievedAt;
          newsSourceName = snapshot.sourceName;
          newsSourceUrl = snapshot.sourceUrl;
          newsDataState = snapshot.dataState ?? "retained-cached-data";
        }
      } catch {
        newsUnavailable = true;
      }
    }
    const base = {
      strategyVersion: MARKET_STRATEGY_CONFIGURATION_V1.version,
      profileId,
      itemId: item.itemId,
      itemName: item.name,
      heldQuantity: holding?.quantity ?? 0,
      ...(holding?.averageAcquisitionPrice === undefined
        ? {}
        : { averageAcquisitionPrice: holding.averageAcquisitionPrice }),
      sources: [
        {
          provider: item.sourceName,
          url: item.sourceUrl,
          retrievedAt: item.retrievedAt,
          state: "retained-cached-data" as const,
        },
      ],
      analysedAt: new Date(this.now()).toISOString(),
      disclaimer: DISCLAIMER,
      ...(eventContext.length === 0 ? {} : { eventContext }),
    };
    if (item.currentPrice === undefined) {
      return MarketRecommendationSchema.parse({
        ...base,
        recommendation: "insufficient-data",
        confidence: 0,
        topReasons: ["The catalogue has no published guide price for this item."],
        warnings: ["No value was fabricated."],
        scores: emptyScores("Guide price unavailable."),
      });
    }
    let series: MarketHistorySeries;
    let comparisonSeries: MarketHistorySeries | undefined;
    let primaryHistoryUnavailable = false;
    let comparisonHistoryUnavailable = false;
    try {
      series = await this.history.getHistory(item.itemId, "180d", options);
    } catch (error) {
      primaryHistoryUnavailable = true;
      if (this.comparisonHistory === undefined) {
        return MarketRecommendationSchema.parse({
          ...base,
          recommendation: "insufficient-data",
          confidence: 0,
          topReasons: ["Validated public history is unavailable."],
          warnings: [error instanceof Error ? error.message : "History provider failed."],
          scores: emptyScores("History unavailable."),
        });
      }
      try {
        series = await this.comparisonHistory.getHistory(item.itemId, "180d", options);
      } catch (fallbackError) {
        return MarketRecommendationSchema.parse({
          ...base,
          recommendation: "insufficient-data",
          confidence: 0,
          topReasons: ["Validated public history is unavailable from both providers."],
          warnings: [
            error instanceof Error ? error.message : "Primary history provider failed.",
            fallbackError instanceof Error
              ? fallbackError.message
              : "Fallback history provider failed.",
          ],
          scores: emptyScores("History unavailable."),
        });
      }
    }
    if (!primaryHistoryUnavailable && this.comparisonHistory !== undefined) {
      try {
        comparisonSeries = await this.comparisonHistory.getHistory(item.itemId, "180d", options);
      } catch {
        comparisonHistoryUnavailable = true;
      }
    }
    const indicators = calculateMarketIndicators(item, series, comparisonSeries);
    const scores = scoreMarketIndicators(indicators, preferences, this.now());
    const eventInstability =
      eventContext.length > 0 &&
      (indicators.dailyReturnVolatilityPercent ?? 0) >=
        MARKET_STRATEGY_CONFIGURATION_V1.extremeVolatilityPercent;
    const confidencePenalty = eventInstability ? 15 : 0;
    const confidence = round(
      Math.max(
        0,
        Math.min(scores.freshness.score, scores.sourceConfidence.score, scores.userFit.score) -
          confidencePenalty,
      ),
    );
    const recommendation = classification(
      indicators,
      scores,
      preferences,
      holding?.quantity ?? 0,
      holding?.averageAcquisitionPrice,
      confidencePenalty,
    );
    const warnings = ["RS3 public sources provide guide prices/history, not a live order book."];
    if (
      indicators.providerDifferencePercent >= MARKET_STRATEGY_CONFIGURATION_V1.disagreementPercent
    )
      warnings.push("Public providers materially disagree; confidence is reduced.");
    if (scores.freshness.score < 50)
      warnings.push("Market history is stale; confidence and recommendation strength are reduced.");
    if (newsUnavailable)
      warnings.push("RuneScape news context was unavailable; no event link was inferred.");
    if (primaryHistoryUnavailable)
      warnings.push(
        "Weird Gloop history was unavailable; Jagex graph history was used as fallback.",
      );
    if (comparisonHistoryUnavailable)
      warnings.push(
        "Jagex graph comparison was unavailable; provider agreement could not be checked.",
      );
    if (eventContext.length > 0) warnings.push(EVENT_CORRELATION_DISCLAIMER);
    if (eventInstability)
      warnings.push(
        "A recent source-backed item mention coincides with extreme volatility; confidence was reduced by 15 points.",
      );
    if (recommendation === "sell-candidate" && holding === undefined)
      throw new CompanionError(
        "Unheld items cannot receive sell recommendations",
        "SAFETY_INVARIANT_FAILED",
      );
    return MarketRecommendationSchema.parse({
      ...base,
      recommendation,
      confidence,
      indicators,
      scores,
      topReasons: [
        scores.overallOpportunity.reasons[0],
        scores.trend.reasons[0],
        scores.liquidity.reasons[0],
      ].filter((value): value is string => value !== undefined),
      warnings,
      sources: [
        ...base.sources,
        {
          provider: series.sourceName,
          url: series.sourceUrl,
          retrievedAt: series.retrievedAt,
          state: series.dataState ?? ("retained-cached-data" as const),
        },
        ...(comparisonSeries === undefined
          ? []
          : [
              {
                provider: comparisonSeries.sourceName,
                url: comparisonSeries.sourceUrl,
                retrievedAt: comparisonSeries.retrievedAt,
                state: comparisonSeries.dataState ?? ("retained-cached-data" as const),
              },
            ]),
        ...(newsRetrievedAt === undefined ||
        newsSourceName === undefined ||
        newsSourceUrl === undefined
          ? []
          : [
              {
                provider: newsSourceName,
                url: newsSourceUrl,
                retrievedAt: newsRetrievedAt,
                state: newsDataState ?? ("retained-cached-data" as const),
              },
            ]),
      ],
    });
  }

  public async createManualOrderPlan(
    profileId: string,
    identifier: number | string,
    options: ProviderRequestOptions = {},
  ) {
    const analysis = await this.analyseGeItem(profileId, identifier, options);
    if (analysis.indicators === undefined)
      throw new CompanionError(
        "A manual order plan requires validated history",
        "INSUFFICIENT_DATA",
      );
    const [holdings, preferences] = await Promise.all([
      this.privateData.getHoldings(profileId),
      this.privateData.getMarketPreferences(profileId),
    ]);
    const current = analysis.indicators.currentGuidePrice;
    const volatilityPercent = clamp(analysis.indicators.dailyReturnVolatilityPercent ?? 5, 2, 15);
    const riskFactor =
      preferences.riskTolerance === "low" ? 0.5 : preferences.riskTolerance === "medium" ? 0.75 : 1;
    const availableGp = holdings?.cashGp ?? 0;
    const allocation = Math.floor(
      ((availableGp * preferences.maximumAllocationPercent) / 100) * riskFactor,
    );
    const budgetQuantity = current === 0 ? 0 : Math.floor(allocation / current);
    const holdingQuantity =
      holdings?.items.find((item) => item.itemId === analysis.itemId)?.quantity ?? 0;
    const maximumSuggestedQuantity =
      analysis.recommendation === "sell-candidate" || analysis.recommendation === "reduce"
        ? holdingQuantity
        : Math.max(
            0,
            Math.min(budgetQuantity, analysis.indicators.buyLimit ?? Number.MAX_SAFE_INTEGER),
          );
    const move = (current * volatilityPercent) / 100;
    return ManualGeOrderPlanSchema.parse({
      analysis,
      suggestedEntryZone: {
        low: safe(Math.max(0, current - move), "Entry zone"),
        high: safe(current, "Entry zone"),
      },
      suggestedProfitTakingZone: {
        low: safe(current + move, "Profit-taking zone"),
        high: safe(current + move * 2, "Profit-taking zone"),
      },
      invalidationRiskZone: {
        low: safe(Math.max(0, current - move * 2), "Risk zone"),
        high: safe(Math.max(0, current - move), "Risk zone"),
      },
      maximumSuggestedQuantity,
      estimatedGpAllocation: safe(maximumSuggestedQuantity * current, "Suggested allocation"),
      availableGp,
      maximumAllocationPercent: preferences.maximumAllocationPercent,
      ...(analysis.indicators.buyLimit === undefined
        ? {}
        : { buyLimit: analysis.indicators.buyLimit }),
      assumptions: [
        "Zones are derived from published guide-price volatility, not instant execution prices.",
        "Position size is capped by saved cash, allocation preference, risk tolerance, and the published buy limit.",
      ],
      generatedAt: new Date(this.now()).toISOString(),
      execution: "manual-only",
    });
  }

  public async scanGeOpportunities(
    profileId: string,
    identifiers: Array<number | string>,
    options: ProviderRequestOptions = {},
  ): Promise<MarketRecommendation[]> {
    if (identifiers.length < 1 || identifiers.length > 100) {
      throw new CompanionError(
        "A market scan requires from 1 to 100 item identifiers",
        "INVALID_ITEM_COUNT",
      );
    }
    const results: MarketRecommendation[] = [];
    for (const identifier of [...new Set(identifiers)]) {
      results.push(await this.analyseGeItem(profileId, identifier, options));
    }
    return results.sort(
      (left, right) =>
        right.scores.overallOpportunity.score - left.scores.overallOpportunity.score ||
        left.itemName.localeCompare(right.itemName),
    );
  }

  public async getPortfolioSummary(profileId: string) {
    const [holdings, trades] = await Promise.all([
      this.privateData.getHoldings(profileId),
      this.privateData.listTrades(profileId),
    ]);
    const allocation: Array<{
      itemId: number;
      quantity: number;
      guideValue: number;
      allocationPercent: number;
    }> = [];
    const missing: number[] = [];
    let guideValue = 0;
    let costBasis = 0;
    let staleExposure = 0;
    let unrealised = 0;
    const now = this.now();
    for (const holding of holdings?.items ?? []) {
      const item = await this.prices.getByIdOrAlias(holding.itemId);
      if (item?.currentPrice === undefined) {
        missing.push(holding.itemId);
        continue;
      }
      const value = safe(item.currentPrice * holding.quantity, "Portfolio value");
      guideValue = safe(guideValue + value, "Portfolio value");
      if (
        now - Date.parse(item.timestamp) >
        MARKET_STRATEGY_CONFIGURATION_V1.staleAfterHours * 3_600_000
      )
        staleExposure = safe(staleExposure + value, "Stale exposure");
      if (holding.averageAcquisitionPrice !== undefined) {
        const basis = safe(holding.averageAcquisitionPrice * holding.quantity, "Cost basis");
        costBasis = safe(costBasis + basis, "Cost basis");
        unrealised = safe(unrealised + value - basis, "Unrealised gain/loss");
      }
      allocation.push({
        itemId: holding.itemId,
        quantity: holding.quantity,
        guideValue: value,
        allocationPercent: 0,
      });
    }
    for (const entry of allocation)
      entry.allocationPercent = guideValue === 0 ? 0 : round((entry.guideValue / guideValue) * 100);
    const lots = new Map<number, { quantity: number; cost: number }>();
    let realised = 0;
    for (const trade of [...trades].sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt),
    )) {
      const lot = lots.get(trade.itemId) ?? { quantity: 0, cost: 0 };
      if (trade.side === "buy") {
        lot.quantity += trade.quantity;
        lot.cost += trade.quantity * trade.unitPrice;
      } else if (lot.quantity > 0) {
        const matched = Math.min(lot.quantity, trade.quantity);
        const averageCost = lot.cost / lot.quantity;
        realised = safe(realised + matched * (trade.unitPrice - averageCost), "Realised gain/loss");
        lot.cost -= matched * averageCost;
        lot.quantity -= matched;
      }
      lots.set(trade.itemId, lot);
    }
    return PortfolioSummarySchema.parse({
      profileId,
      guideValue,
      knownCostBasis: costBasis,
      realisedGainLoss: realised,
      unrealisedGuideValueGainLoss: unrealised,
      pricedItemCount: allocation.length,
      unpricedItemCount: missing.length,
      stalePriceExposureGp: staleExposure,
      missingPriceItemIds: missing,
      concentrationRiskPercent: Math.max(0, ...allocation.map((entry) => entry.allocationPercent)),
      allocation,
      calculatedAt: new Date(now).toISOString(),
      warnings: [
        "Guide-value profit is estimated until a matching trade is recorded manually.",
        ...(missing.length === 0
          ? []
          : ["Some holdings have no public guide price and were not valued."]),
      ],
    });
  }

  public async backtestGeStrategy(
    itemId: number,
    input: MarketBacktestInput,
    options: ProviderRequestOptions = {},
  ): Promise<MarketBacktestResult> {
    const series = await this.history.getHistory(itemId, "180d", options);
    return backtestMarketSeries(series, input);
  }
}

function emptyScores(reason: string): MarketComponentScores {
  return MarketComponentScoresSchema.parse({
    trend: scoreComponent(0, reason),
    meanReversion: scoreComponent(0, reason),
    liquidity: scoreComponent(0, reason),
    volatilityRisk: scoreComponent(0, reason),
    freshness: scoreComponent(0, reason),
    sourceConfidence: scoreComponent(0, reason),
    userFit: scoreComponent(0, reason),
    overallOpportunity: scoreComponent(0, reason),
  });
}

export function backtestMarketSeries(
  series: MarketHistorySeries,
  rawInput: MarketBacktestInput,
): MarketBacktestResult {
  const input = MarketBacktestInputSchema.parse(rawInput);
  const points = series.points;
  if (points.length < 60)
    throw new CompanionError(
      "Backtesting requires at least 60 historical points",
      "INSUFFICIENT_DATA",
    );
  const split = Math.floor(points.length * input.trainingFraction);
  const evaluation = points.slice(split);
  const returns: number[] = [];
  const holdings: number[] = [];
  let signals = 0;
  let insufficient = 0;
  let turnover = 0;
  let equity = input.initialGp;
  let peak = equity;
  let maximumDrawdown = 0;
  let walkForwardWindows = 0;
  const confidenceBands = {
    low: { signals: 0, returns: [] as number[] },
    medium: { signals: 0, returns: [] as number[] },
    high: { signals: 0, returns: [] as number[] },
  };
  for (let index = split; index < points.length - input.fillDelayDays - 1; index += 1) {
    walkForwardWindows += 1;
    const prefix = points.slice(0, index + 1).map((point) => point.price);
    if (prefix.length < 30) {
      insufficient += 1;
      continue;
    }
    const sma7 = mean(last(prefix, 7)) ?? 0;
    const sma30 = mean(last(prefix, 30)) ?? 0;
    const current = prefix.at(-1) ?? 0;
    const sevenAgo = prefix.at(-8);
    if (current <= sma7 || sma7 <= sma30 || sevenAgo === undefined || current <= sevenAgo) continue;
    const momentum7Percent = percentageChange(current, sevenAgo) ?? 0;
    const spreadPercent = sma30 === 0 ? 0 : ((sma7 - sma30) / sma30) * 100;
    const signalConfidence = clamp(50 + momentum7Percent * 4 + spreadPercent * 6);
    const confidenceBand =
      signalConfidence >= 75 ? "high" : signalConfidence >= 50 ? "medium" : "low";
    signals += 1;
    confidenceBands[confidenceBand].signals += 1;
    const fillIndex = index + input.fillDelayDays;
    const exitIndex = Math.min(fillIndex + input.maximumHoldingDays, points.length - 1);
    const rawEntry = points[fillIndex]?.price;
    const rawExit = points[exitIndex]?.price;
    if (rawEntry === undefined || rawExit === undefined || rawEntry === 0) {
      insufficient += 1;
      continue;
    }
    const entry = rawEntry * (1 + input.slippagePercent / 100);
    const exitPrice = rawExit * (1 - input.slippagePercent / 100);
    const quantity = Math.min(
      Math.floor(equity / entry),
      input.buyLimit ?? Number.MAX_SAFE_INTEGER,
    );
    if (quantity < 1) {
      insufficient += 1;
      continue;
    }
    const invested = quantity * entry;
    const proceeds = quantity * exitPrice;
    const tradeReturn = ((proceeds - invested) / invested) * 100;
    equity += proceeds - invested;
    turnover += invested + proceeds;
    returns.push(tradeReturn);
    confidenceBands[confidenceBand].returns.push(tradeReturn);
    holdings.push(exitIndex - fillIndex);
    peak = Math.max(peak, equity);
    maximumDrawdown = Math.max(maximumDrawdown, peak === 0 ? 0 : ((peak - equity) / peak) * 100);
    index = exitIndex - 1;
  }
  const evaluationReturns = evaluation.slice(1).flatMap((point, index) => {
    const prior = evaluation[index]?.price;
    return prior === undefined || prior === 0 ? [] : [((point.price - prior) / prior) * 100];
  });
  return MarketBacktestResultSchema.parse({
    strategyVersion: MARKET_STRATEGY_CONFIGURATION_V1.version,
    trainingPointCount: split,
    evaluationPointCount: points.length - split,
    signalCount: signals,
    completedTradeCount: returns.length,
    hitRatePercent:
      returns.length === 0
        ? 0
        : round((returns.filter((value) => value > 0).length / returns.length) * 100),
    medianReturnPercent: round(median(returns)),
    meanReturnPercent: round(mean(returns) ?? 0),
    maximumDrawdownPercent: round(maximumDrawdown),
    volatilityPercent: round(standardDeviation(evaluationReturns) ?? 0),
    turnoverGp: safe(turnover, "Backtest turnover"),
    averageHoldingDays: round(mean(holdings) ?? 0),
    insufficientDataCount: insufficient,
    walkForwardWindowCount: walkForwardWindows,
    resultsByConfidenceBand: (["low", "medium", "high"] as const).map((band) => {
      const result = confidenceBands[band];
      return {
        band,
        signalCount: result.signals,
        completedTradeCount: result.returns.length,
        hitRatePercent:
          result.returns.length === 0
            ? 0
            : round(
                (result.returns.filter((value) => value > 0).length / result.returns.length) * 100,
              ),
        meanReturnPercent: round(mean(result.returns) ?? 0),
      };
    }),
    trainingPeriod: { from: points[0]?.timestamp, to: points[split - 1]?.timestamp },
    evaluationPeriod: { from: points[split]?.timestamp, to: points.at(-1)?.timestamp },
    protections: [
      "Signals use only observations at or before the simulated signal date.",
      "The fixed strategy configuration is not tuned against the evaluation period.",
      "A separate chronological training/evaluation split is enforced.",
      "Evaluation uses sequential expanding-history walk-forward windows without future observations.",
      "Fill delay, slippage, buy limits, and insufficient-history exclusions are applied.",
      "Evaluation advances after each simulated holding period to avoid overlapping capital.",
    ],
    assumptions: input,
    disclaimer:
      "Historical guide-price backtests are hypothetical and do not guarantee future or executable Grand Exchange returns.",
  });
}
