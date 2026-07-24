# Version 0.4 known limitations

- Public RS3 sources provide guide prices and daily history, not an instant
  order book. Instant buy/high and sell/low prices are reported as unavailable.
- Historical per-day volume is not published by the Jagex graph. The catalogue
  includes only the latest daily volume where available.
- Price history is loaded on demand per item. A newly synchronized catalogue
  does not prefetch 180 days for all 7,000+ items.
- Training materials can be repriced only when the caller supplies consumption
  quantities. Wiki training rates do not reliably encode materials consumed per
  XP, so the published plan GP range remains separate to avoid double-counting.
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
- Wiki training rates are human-maintained estimates and can depend on gear,
  boosts, attention, banking, and unlocks the companion cannot observe.
- Missing XP/hour or GP data stays unknown. A source-listed method without a
  rate cannot be used in a time plan.
- Ironman compatibility defaults to unknown. Item and equipment ownership is
  never inferred from the profile.
- Cheapest/balanced selection is limited by the GP values the guide publishes;
  it returns a visible fallback warning when no comparable cost data exists.
