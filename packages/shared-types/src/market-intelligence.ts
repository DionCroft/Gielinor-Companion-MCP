import { z } from "zod";

import { MarketPreferencesSchema } from "./player-private-data.js";

const finite = z.number().finite();
const percent = finite.min(-1_000_000).max(1_000_000);
const score = finite.min(0).max(100);
const isoDateTime = z.string().datetime({ offset: true });
const safeGp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const MarketRecommendationTypeSchema = z.enum([
  "strong-buy-candidate",
  "buy-candidate",
  "watch",
  "hold",
  "reduce",
  "sell-candidate",
  "avoid",
  "insufficient-data",
]);
export type MarketRecommendationType = z.infer<typeof MarketRecommendationTypeSchema>;

export const MarketStrategyConfigurationSchema = z
  .object({
    version: z.literal("1.1.0-strategy-v1"),
    minimumHistoryPoints: z.number().int().min(7).max(365),
    strongBuyThreshold: score,
    buyThreshold: score,
    avoidThreshold: score,
    extremeVolatilityPercent: z.number().positive().finite(),
    disagreementPercent: z.number().positive().finite(),
    staleAfterHours: z.number().positive().finite(),
    trendWeights: z
      .object({
        trend: score,
        liquidity: score,
        risk: score,
        freshness: score,
        confidence: score,
        userFit: score,
      })
      .strict(),
    meanReversionWeights: z
      .object({
        meanReversion: score,
        liquidity: score,
        risk: score,
        freshness: score,
        confidence: score,
        userFit: score,
      })
      .strict(),
  })
  .strict();
export type MarketStrategyConfiguration = z.infer<typeof MarketStrategyConfigurationSchema>;

export const MARKET_STRATEGY_CONFIGURATION_V1: MarketStrategyConfiguration = Object.freeze({
  version: "1.1.0-strategy-v1",
  minimumHistoryPoints: 30,
  strongBuyThreshold: 78,
  buyThreshold: 65,
  avoidThreshold: 35,
  extremeVolatilityPercent: 12,
  disagreementPercent: 10,
  staleAfterHours: 36,
  trendWeights: { trend: 35, liquidity: 15, risk: 15, freshness: 10, confidence: 10, userFit: 15 },
  meanReversionWeights: {
    meanReversion: 35,
    liquidity: 15,
    risk: 15,
    freshness: 10,
    confidence: 10,
    userFit: 15,
  },
});

export const MarketIndicatorsSchema = z
  .object({
    currentGuidePrice: safeGp,
    previousGuidePrice: safeGp.optional(),
    latestHistoryPrice: safeGp,
    latestVolume: safeGp.optional(),
    averageVolume30d: finite.nonnegative().optional(),
    change1dPercent: percent.optional(),
    change7dPercent: percent.optional(),
    change30dPercent: percent.optional(),
    change90dPercent: percent.optional(),
    change180dPercent: percent.optional(),
    sma7: finite.nonnegative().optional(),
    sma30: finite.nonnegative().optional(),
    sma90: finite.nonnegative().optional(),
    priceVsSma30Percent: percent.optional(),
    dailyReturnVolatilityPercent: finite.nonnegative().optional(),
    historicalHigh: safeGp,
    historicalLow: safeGp,
    distanceFromHighPercent: percent,
    distanceFromLowPercent: percent,
    outlierScore: finite,
    providerDifferencePercent: finite.nonnegative(),
    comparisonHistoryPrice: safeGp.optional(),
    comparisonHistoryTimestamp: isoDateTime.optional(),
    comparisonProviderName: z.string().min(1).optional(),
    historyPointCount: z.number().int().nonnegative(),
    buyLimit: safeGp.optional(),
    guidePriceTimestamp: isoDateTime,
    historyTimestamp: isoDateTime,
  })
  .strict();
export type MarketIndicators = z.infer<typeof MarketIndicatorsSchema>;

export const MarketScoreComponentSchema = z
  .object({ score, reasons: z.array(z.string().min(1)).min(1).max(20) })
  .strict();

export const MarketComponentScoresSchema = z
  .object({
    trend: MarketScoreComponentSchema,
    meanReversion: MarketScoreComponentSchema,
    liquidity: MarketScoreComponentSchema,
    volatilityRisk: MarketScoreComponentSchema,
    freshness: MarketScoreComponentSchema,
    sourceConfidence: MarketScoreComponentSchema,
    userFit: MarketScoreComponentSchema,
    overallOpportunity: MarketScoreComponentSchema,
  })
  .strict();
export type MarketComponentScores = z.infer<typeof MarketComponentScoresSchema>;

export const MarketSourceEvidenceSchema = z
  .object({
    provider: z.string().min(1),
    url: z.string().url(),
    retrievedAt: isoDateTime,
    state: z.enum(["live-public-data", "retained-cached-data", "unavailable"]),
  })
  .strict();

export const MarketEventContextSchema = z
  .object({
    newsItemId: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    publishedAt: isoDateTime,
    tags: z.array(z.string().min(1)).max(50),
    matchBasis: z.enum(["exact-source-tag", "exact-item-name-in-title"]),
    correlationDisclaimer: z.literal(
      "The published update mentions this item; correlation does not prove that it caused a market move.",
    ),
  })
  .strict();
export type MarketEventContext = z.infer<typeof MarketEventContextSchema>;

export const MarketRecommendationSchema = z
  .object({
    strategyVersion: z.literal("1.1.0-strategy-v1"),
    profileId: z.string().min(1),
    itemId: z.number().int().positive(),
    itemName: z.string().min(1),
    recommendation: MarketRecommendationTypeSchema,
    confidence: score,
    heldQuantity: safeGp,
    averageAcquisitionPrice: safeGp.optional(),
    indicators: MarketIndicatorsSchema.optional(),
    scores: MarketComponentScoresSchema,
    topReasons: z.array(z.string().min(1)).min(1).max(10),
    warnings: z.array(z.string().min(1)).max(30),
    sources: z.array(MarketSourceEvidenceSchema).min(1),
    eventContext: z.array(MarketEventContextSchema).max(20).optional(),
    analysedAt: isoDateTime,
    disclaimer: z.string().min(1),
  })
  .strict();
export type MarketRecommendation = z.infer<typeof MarketRecommendationSchema>;

export const ManualGeOrderPlanSchema = z
  .object({
    analysis: MarketRecommendationSchema,
    suggestedEntryZone: z.object({ low: safeGp, high: safeGp }).strict(),
    suggestedProfitTakingZone: z.object({ low: safeGp, high: safeGp }).strict(),
    invalidationRiskZone: z.object({ low: safeGp, high: safeGp }).strict(),
    maximumSuggestedQuantity: safeGp,
    estimatedGpAllocation: safeGp,
    availableGp: safeGp,
    maximumAllocationPercent: finite.min(1).max(100),
    buyLimit: safeGp.optional(),
    assumptions: z.array(z.string().min(1)).min(1),
    generatedAt: isoDateTime,
    execution: z.literal("manual-only"),
  })
  .strict();
export type ManualGeOrderPlan = z.infer<typeof ManualGeOrderPlanSchema>;

export const PortfolioSummarySchema = z
  .object({
    profileId: z.string().min(1),
    guideValue: safeGp,
    knownCostBasis: safeGp,
    realisedGainLoss: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    unrealisedGuideValueGainLoss: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER),
    pricedItemCount: z.number().int().nonnegative(),
    unpricedItemCount: z.number().int().nonnegative(),
    stalePriceExposureGp: safeGp,
    missingPriceItemIds: z.array(z.number().int().positive()),
    concentrationRiskPercent: finite.min(0).max(100),
    allocation: z.array(
      z
        .object({
          itemId: z.number().int().positive(),
          quantity: safeGp,
          guideValue: safeGp,
          allocationPercent: finite.min(0).max(100),
        })
        .strict(),
    ),
    calculatedAt: isoDateTime,
    warnings: z.array(z.string().min(1)),
  })
  .strict();
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

export const MarketBacktestInputSchema = z
  .object({
    initialGp: safeGp.min(1),
    slippagePercent: finite.min(0).max(25),
    fillDelayDays: z.number().int().min(1).max(30),
    maximumHoldingDays: z.number().int().min(1).max(365),
    trainingFraction: finite.min(0.5).max(0.9),
    buyLimit: safeGp.optional(),
  })
  .strict();
export type MarketBacktestInput = z.infer<typeof MarketBacktestInputSchema>;

export const MarketBacktestResultSchema = z
  .object({
    strategyVersion: z.literal("1.1.0-strategy-v1"),
    trainingPointCount: z.number().int().nonnegative(),
    evaluationPointCount: z.number().int().nonnegative(),
    signalCount: z.number().int().nonnegative(),
    completedTradeCount: z.number().int().nonnegative(),
    hitRatePercent: finite.min(0).max(100),
    medianReturnPercent: percent,
    meanReturnPercent: percent,
    maximumDrawdownPercent: finite.min(0).max(100),
    volatilityPercent: finite.nonnegative(),
    turnoverGp: safeGp,
    averageHoldingDays: finite.nonnegative(),
    insufficientDataCount: z.number().int().nonnegative(),
    walkForwardWindowCount: z.number().int().nonnegative(),
    resultsByConfidenceBand: z
      .array(
        z
          .object({
            band: z.enum(["low", "medium", "high"]),
            signalCount: z.number().int().nonnegative(),
            completedTradeCount: z.number().int().nonnegative(),
            hitRatePercent: finite.min(0).max(100),
            meanReturnPercent: percent,
          })
          .strict(),
      )
      .length(3),
    trainingPeriod: z.object({ from: isoDateTime, to: isoDateTime }).strict(),
    evaluationPeriod: z.object({ from: isoDateTime, to: isoDateTime }).strict(),
    protections: z.array(z.string().min(1)).min(4),
    assumptions: MarketBacktestInputSchema,
    disclaimer: z.string().min(1),
  })
  .strict();
export type MarketBacktestResult = z.infer<typeof MarketBacktestResultSchema>;

export const EffectiveMarketPreferencesSchema = MarketPreferencesSchema;
