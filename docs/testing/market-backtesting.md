# Market backtesting

The Version 1.1 backtester evaluates deterministic guide-price signals before
they are treated as strong candidates by default.

## Protections

- Points are sorted chronologically and duplicate timestamps are rejected by
  the provider contract.
- Training and evaluation periods are separate (`trainingFraction` 0.5–0.9).
- A signal can use only observations at or before its simulated date.
- The evaluation advances through sequential expanding-history walk-forward
  windows; future evaluation observations never enter a signal calculation.
- Fills occur after `fillDelayDays`, never on the signal observation.
- Configurable slippage is applied to simulated entry and exit.
- Quantity is bounded by cash and an optional published buy limit.
- Items or periods with insufficient history are counted, not invented.
- Holding duration is bounded and results are reproducible for identical input.

The implementation performs chronological out-of-sample, expanding-window
walk-forward evaluation. It does not tune thresholds against the final
evaluation segment.

## Reported fields

Reports include signal and completed-trade counts, hit rate, median and mean
return, maximum drawdown, return volatility, turnover, average holding period,
insufficient-data count, walk-forward window count, results for low/medium/high
signal-confidence bands, date ranges, assumptions and the protections applied.
All values are hypothetical guide-price results; they do not represent actual
Grand Exchange fills.

Run:

```sh
corepack pnpm test:backtesting
corepack pnpm test:market-intelligence
```

Live provider tests remain separate from deterministic backtests.
