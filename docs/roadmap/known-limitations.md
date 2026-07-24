# Version 1.0 known limitations

- The optional Alt1 integration is Windows-only because Alt1 supports Windows.
  Manual text analysis and every core companion feature remain available
  without it.
- Alt1 and Gielinor Companion are unofficial community software. The overlay was
  reviewed against current Jagex/Alt1 policies, but policy can change and no
  official approval is implied.
- The app pins `alt1` 0.1.3 and requires Alt1 1.6.0 or later. The upstream
  image-recognition API describes itself as changeable, so compatibility must be
  rechecked when upgrading.
- Automatic capture is limited to visible main-chat OCR. Dialogue elsewhere,
  hidden chat, unsupported layouts, filters, UI scaling, and font/game updates
  can prevent recognition; manual paste remains the fallback.
- OCR and keyword matches are advisory. Even high-confidence completion signals
  require confirmation and never update a profile or game state.
- Guide packs are pasted locally in Version 1.0. There is no live
  profile/MCP-to-overlay bridge, avoiding a network path for screen observations.
- The repository builds the static overlay but does not publish a trusted
  hosting origin. Operators must serve the build themselves or use local
  development mode.

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
- Local profiles have no delete MCP tool; hosted account deletion remains a
  separately authenticated HTTP lifecycle operation.
- Hosted private profiles use fixed bearer headers rather than OAuth. ChatGPT
  connects only to a public remote MCP endpoint and cannot use the local stdio
  server; use anonymous public tools there. Private profiles require a client
  that can configure an Authorization header.
- In-memory rate limits are per service instance. Multi-replica deployments need
  an external gateway/distributed limiter before horizontal scaling.
- The hosted Node process does not terminate TLS. Operators must keep its port
  private and configure an HTTPS reverse proxy correctly.
- Account deletion covers the live data directory, not infrastructure backups
  or snapshots retained by an operator.
- Fresh hosted databases report public catalogues as `never-synced` until an
  operator invokes the restricted refresh tools.
- Release automation builds Windows, macOS, and Linux installers and verifies
  their checksums and attestations. Platform signing/notarization depends on
  maintainer-owned certificates; artifacts are otherwise explicitly unsigned.
  Updates are manual and opt-in.
- Goals and ad-hoc shopping lists use installation-local UI storage/state;
  portable profile export covers schema-versioned profile goals and quest state,
  not those ad-hoc dashboard entries.
- Desktop offline mode disables explicit refresh controls. Headless
  `GIELINOR_OFFLINE=true` additionally restricts provider routing to retained
  cache-capable reads. Neither is an operating-system network firewall.
- Provider health is in-memory operational evidence and resets on process
  restart. It is not a long-term uptime monitor or authority score.
- Version 1.0 ships provider API v1 inside the monorepo; independently
  installed dynamic plugin discovery is intentionally deferred until a signed
  package trust policy exists.
- Performance and hosted load thresholds are regression budgets on CI-class
  hardware, not capacity guarantees for a particular deployment.
- Local AI requires a separately installed, running Ollama or LM Studio server
  and a model capable of structured tool use. Model quality and hardware needs
  vary; the project does not download a model automatically.
- Only loopback model servers without API authentication are supported in
  Version 1.0. LAN and hosted model endpoints are intentionally rejected by
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
