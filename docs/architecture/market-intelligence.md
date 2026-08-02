# Market intelligence

`MarketIntelligenceService` is deterministic core code. A language model may
summarise its result, but cannot calculate, alter or invent a signal.

## Inputs and indicators

The service combines the selected profile's confirmed holdings, acquisition
price, cash and preferences with validated RS3 catalogue/history data. It
calculates 1/7/30/90/180-day changes where possible, 7/30/90-point simple
moving averages, price versus the 30-point average, sample daily-return
volatility, historical range, distance from the range, a z-score-like outlier,
published volume, buy limit, freshness and provider difference.

The primary market series is Weird Gloop's RS3 exchange history. The service
independently loads the Jagex ItemDB graph, records both sources and compares
their latest published history values. If Weird Gloop is unavailable, validated
Jagex graph history is the explicit fallback; if comparison is unavailable, the
result says so instead of claiming agreement.

Missing volume or history remains missing and lowers confidence. Public RS3
data is guide-price/history data, not an order book or guaranteed fill price.

## Versioned scoring

Configuration `1.1.0-strategy-v1` produces components from 0–100:

- trend;
- mean reversion;
- liquidity;
- volatility/risk;
- freshness;
- source confidence;
- user fit;
- overall opportunity.

Trend mode weights trend 35%, liquidity 15%, risk 15%, freshness 10%, source
confidence 10% and user fit 15%. Mean-reversion mode substitutes the
mean-reversion component at 35%. Balanced mode averages trend and mean
reversion before applying the same surrounding weights. Reasons are stored with
every component.

The output categories are `strong-buy-candidate`, `buy-candidate`, `watch`,
`hold`, `reduce`, `sell-candidate`, `avoid` and `insufficient-data`. At least 30
history points are required. Confidence is the minimum of freshness, source
confidence and user fit. A sell candidate requires a recorded holding plus
profit, outlier and weakening-momentum evidence; an unheld item can never be a
sell recommendation.

Items with extreme observed volatility are rejected as new buy candidates.
User-defined minimum volume and maximum volatility are enforced. With
`avoidNewOrUnstableItems`, fewer than 90 observations cannot become a buy
candidate. Recent news affects a signal only when the source supplies an exact
item tag or the exact canonical/alias name appears in the title. An exact match
combined with extreme volatility reduces confidence; the output always warns
that correlation does not prove causation.

## Manual plans and sizing

Entry, profit-taking and invalidation zones are guide-price estimates based on
current price and observed volatility. They are not instant trade prices.
Maximum quantity is bounded by:

1. confirmed available cash;
2. saved maximum allocation percentage;
3. risk factor (low 0.5, medium 0.75, high 1.0);
4. current guide price;
5. published buy limit; and
6. held quantity for reduce/sell plans.

Plans contain assumptions, timestamps, warnings and `execution: manual-only`.
No tool places, edits or cancels a Grand Exchange offer.

## Portfolio and evaluation

Portfolio analytics separate realised manual-trade gain/loss from unrealised
guide-value estimates and report concentration, missing prices and stale-price
exposure. Paper portfolios remain isolated from confirmed holdings.

Backtests split chronological training/evaluation periods, use expanding-history
walk-forward windows containing only observations available at the simulated
date, delay fills, apply configured slippage, bound quantity and holding
duration, and return failure counts and confidence-band results. See
[Market backtesting](../testing/market-backtesting.md).
