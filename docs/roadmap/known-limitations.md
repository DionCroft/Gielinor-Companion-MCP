# Version 0.6 known limitations

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
- The desktop source and unsigned installer build are verified, but this
  development release does not publish signed/notarized binaries.
- Goals and ad-hoc shopping lists use installation-local UI storage/state;
  portable profile export covers schema-versioned profile goals and quest state,
  not those ad-hoc dashboard entries.
- Offline mode disables explicit refresh controls and clearly uses retained
  data. It is not an operating-system network firewall.
- Local AI requires a separately installed, running Ollama or LM Studio server
  and a model capable of structured tool use. Model quality and hardware needs
  vary; the project does not download a model automatically.
- Only loopback model servers without API authentication are supported in
  Version 0.6. LAN and hosted model endpoints are intentionally rejected by
  local-only privacy mode.
- Ollama discovery filters its explicit capability metadata. LM Studio's
  OpenAI-compatible model list does not consistently expose tool capability, so
  the UI lists reported models and clearly surfaces a failure if the selected
  model cannot call tools.
- Local conversation history is intentionally in memory only and is cleared on
  app exit, profile changes, provider changes, or manual reset.
- Responses from a language model can still be incomplete or poorly worded.
  Only the displayed trusted-tool activity and validated tool envelope represent
  confirmed companion data.
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
