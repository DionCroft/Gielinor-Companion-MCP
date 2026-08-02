# Understanding GE recommendations

Recommendations are deterministic analytical estimates over public RS3 guide
history. They may be wrong. They are not financial advice, guaranteed profit or
an automatically executed offer.

Candidate cards show recommendation, opportunity and confidence, guide price
and timestamp, trend, volatility, published volume, buy limit, estimated zones,
maximum quantity, reasons and warnings. A single unexplained Buy button is
deliberately not provided.

## Categories

- `strong-buy-candidate` / `buy-candidate`: an unheld item meets the configured
  opportunity and confidence thresholds;
- `watch`: evidence is valid but below a buy threshold;
- `hold`: a recorded holding has no deterministic reduce/sell condition;
- `reduce` / `sell-candidate`: only possible when the selected profile records
  a holding;
- `avoid`: confidence, fit or opportunity is too low;
- `insufficient-data`: a required guide price or minimum history is absent.

The confidence score is capped by freshness, provider agreement and your saved
preferences. Stale history, missing volume, too little history, provider
disagreement and preference violations reduce it.

Provider agreement compares Weird Gloop RS3 exchange history with the
independent Jagex ItemDB graph. Exact source-backed news mentions are shown as
context, never as invented causation; correlation does not prove the update
caused a price movement.

Entry, profit-taking and invalidation ranges use published guide-price
statistics and volatility. They are not actual instant buy/sell quotes. Position
sizing respects confirmed cash, allocation percentage, risk tolerance, buy
limit and existing holdings.

Use paper trading and review backtests before relying on a strategy. Enter any
real offer yourself in RuneScape; the companion never places, edits or cancels
one.
