# Player-private data

Public RuneScape APIs cannot provide a trustworthy complete bank, inventory,
equipment setup, active GE offers or quest log. Version 1.1 therefore stores
only player-controlled private records in the local SQLite database.

## Stored records

Database migration 7 adds versioned holdings snapshots, manual GE trades,
market preferences, watchlists and the selected-profile singleton. Migration 8
adds the isolated paper portfolio. Foreign keys cascade only when the owning
local profile is deliberately removed.

- `player_holdings_snapshots`: cash, item quantities, optional acquisition
  prices, capture time and source;
- `ge_trade_records`: manual buy/sell history and optional notes;
- `player_market_preferences`: risk, strategy, allocation, liquidity,
  volatility and confidence preferences;
- `market_watchlists`: named private item-ID lists;
- `selected_player_profile`: the profile all account-aware planners must use;
- `paper_portfolios`: hypothetical cash, holdings and simulated trades.

Holdings sources are `manual`, `csv-import`, `json-import` or
`alt1-confirmed`. An Alt1-derived record must be confirmed before persistence.
OCR is only an observation of visible pixels and never represents a complete
account snapshot.

## Mutation rules

- Bulk holdings replacement requires `confirmReplace: true`.
- Trade deletion requires explicit confirmation.
- Schemas reject duplicate holdings, invalid item IDs, negative GP, overflow
  and malformed imports.
- CSV cells are protected against spreadsheet formula execution on export.
- The latest confirmed holdings snapshot is the only snapshot subtracted from
  an account-aware quest shopping list.
- Alternative quest items and unresolved catalogue names are not subtracted
  automatically.

Paper trades use a separate repository path, enforce simulated cash and held
quantity, and never modify real holdings or RuneScape.

## Privacy boundary

Data stays in the selected local database unless the user explicitly exports
it. Hiscores refresh sends only the public display name to the selected public
Hiscores endpoint. The project never asks for account credentials and never
reads client memory, intercepts packets or generates game input.

See [Holdings and trade journal](../guides/holdings-and-trade-journal.md) for
the user workflow.
