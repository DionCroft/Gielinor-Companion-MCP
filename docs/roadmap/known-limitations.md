# Version 0.1 known limitations

- Quest search, requirements, routes, status, and shopping lists start in 0.2.
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
- Cache refresh diagnostics are currently surfaced through tool errors rather
  than a dedicated source-status tool.
