# Version 0.2 known limitations

- Training methods and multi-stage budget/time plans start in 0.3.
- Item search, buy limits, price history, averages, volatility, and valuation
  start in 0.4.
- The current GE value is Jagex's guide price, not an instant high/low trade.
- Hiscores cannot provide reliable quest completion, bank contents, game mode
  discovery, or private account data.
- Profiles have no delete tool in 0.1; this avoids an unnecessary destructive MCP
  operation before profile-management UI work.
- Only local stdio transport is shipped. There is no hosted endpoint.
- No desktop/no-AI dashboard or agent runtime is shipped.
- No npm release or signed desktop artifact is published by this source snapshot.
- Mode-specific Hiscores endpoint overrides are not independently configurable.
- Wiki item/reward fields are human-maintained markup. Quantities and explicit
  alternatives are normalized, but consumption and tradeability are not inferred.
- `Misc:` quest requirements remain visible manual checks. Lore-only `Full:` and
  `Follows:` graphs are not treated as start requirements.
- Quest status is manually tracked because Jagex Hiscores does not expose a
  trustworthy complete quest-state feed.
