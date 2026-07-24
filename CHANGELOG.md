# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and
semantic versioning.

## [0.9.0] - 2026-07-24

### Added

- Typed provider plugin interface with capability metadata, deterministic
  priority/fallback, disagreement records, offline eligibility, shared result
  validation, and per-capability health.
- Default provider composition factory and core-port adapter, allowing another
  provider to register without modifying domain services.
- Transactional SQLite migration planning/runner, schema version 5 operational
  indexes, generic copied data migrations, and legacy-profile-to-v1 migration.
- Cache-only offline reads, concurrent URL/cache-key request deduplication, and
  stable offline cache errors.
- Provider contract fixtures; fallback, priority, disagreement, failure,
  migration rollback, database lock, schema compatibility, large graph/profile,
  memory, and hosted load tests.
- Performance profiler, configurable hosted load driver, contributor guides,
  provider issue form, pull request template, threat model, security checklist,
  dependency audit, and accessibility audit.

### Changed

- Local and hosted composition roots now consume the registry through existing
  core ports.
- Hosted readiness includes provider health observations.
- The desktop gains a visible-on-focus skip link and an executable landmark/name
  accessibility contract.
- The locked MCP transitive Hono adapter is overridden to patched version 2.0.11.

### Security

- Node audit reports no known locked vulnerabilities after remediation.
- RustSec audit is enforced in CI against the Tauri lockfile.
- Failure and load tests verify no corrupted migration/cache/database state.

## [0.8.0] - 2026-07-23

### Added

- Optional standalone Alt1 app for local, visible-main-chat quest guidance.
- Explicit policy acknowledgement, per-field visibility, separate enable/connect
  actions, pause, disconnect, and complete revoke.
- Schema-versioned local guidance packs, source-labelled redacted observations,
  confidence scores, matched guide steps, and optional unclickable annotations.
- Manual pasted-text fallback that works without Alt1.
- Runtime compatibility/permission checks and safe handling for malformed
  captures, unsupported screens, permission loss, and reconnects.
- Install/uninstall, privacy, policy, data-source, and completion documentation.
- Twenty-seven deterministic tests covering consent, UI flow, field visibility,
  redaction, false positives, manual confirmation, permissions, events,
  compatibility, removal, CSP, and no-input guarantees.

### Security

- Capture is disabled by default and requires explicit consent followed by a
  separate Connect action.
- The production content-security policy sets `connect-src 'none'`; raw pixels
  and OCR text are never stored or transmitted.
- Player/private-chat-shaped lines, links, emails, addresses, and long
  identifiers are rejected or redacted before display.
- The Alt1 adapter declares only `pixel,overlay`, pins library version `0.1.3`,
  requires Alt1 1.6.0+, and exposes no input, memory, packet, process, socket, or
  trading capability.
- Probable quest completions require manual confirmation and cannot mutate a
  companion profile or RuneScape state.

## [0.7.0] - 2026-07-23

### Added

- Stateless MCP Streamable HTTP service at `/mcp`, preserving the existing 48
  tools and local stdio behavior.
- Anonymous public tools, optional bearer-token accounts, per-account SQLite
  profile isolation, shared public-data storage, and operator-only dataset
  refreshes.
- Account creation gate, profile/account export and import, immediate token
  revocation, and account data deletion.
- Liveness/readiness endpoints, bounded JSON bodies and protocol messages,
  separate request/tool-call rate limits, strict configuration parsing, and
  privacy-preserving structured logs.
- Non-root read-only container, loopback-bound Compose configuration, Nginx TLS
  reverse-proxy example, hosted deployment/privacy guides, and current
  ChatGPT/Claude connection notes.
- Remote protocol, authentication, authorization, cross-user isolation, account
  lifecycle, rate/size limit, health, configuration, and deployment tests.

### Security

- Raw account and operator tokens are never stored or logged. Account access
  tokens are looked up by SHA-256 digest and shown only once.
- Host and Origin allowlists, optional trusted-proxy HTTPS enforcement, content
  type checks, safe error envelopes, no-store responses, and strict time/size
  budgets protect the public boundary.
- Profile storage paths derive only from validated account UUIDs returned by the
  control database. Anonymous/operator sessions cannot open profile storage.
- Container defaults drop all Linux capabilities, prohibit privilege
  escalation, use an unprivileged UID, and expose the application only on host
  loopback in Compose.

## [0.6.0] - 2026-07-23

### Added

- Model-independent `@gielinor/agent-runtime` with Ollama and LM Studio
  adapters, shared JSON tool schemas, multi-turn and parallel tool calls,
  conversation state, and deterministic tool execution.
- Capability-aware Ollama model discovery and OpenAI-compatible LM Studio model
  discovery.
- Desktop provider/endpoint/model configuration, connection testing, request
  timeout and tool-loop controls, conversation reset, and live trusted-tool
  activity.
- Deterministic tests for single, sequential, and parallel calls; invalid
  arguments; unknown tools; timeouts; loop limits; provider/model outages;
  partial and malformed responses; tool failures; and conversation state.
- Optional Ollama and LM Studio live adapter smoke commands and local setup
  documentation.

### Security

- Local model endpoints are restricted twice: runtime URL validation accepts
  only loopback addresses, and Tauri's native HTTP capability allows only
  `localhost`, `127.0.0.1`, and `::1`.
- The model can invoke only the existing 48 trusted tools. Shared Zod schemas
  validate inputs before execution and generic tool envelopes before a result
  reaches the model.
- Overall timeouts, one-megabyte requests/results, two-megabyte provider
  responses, eight calls per turn, and ten loops maximum bound resource use.
- Invalid or failed tool calls are returned as explicit error results and never
  represented as successful companion data.

## [0.5.0] - 2026-07-23

### Added

- Accessible Tauri 2 and React desktop application with first-run setup,
  multiple local profiles, skills, quest route/checklist/shopping views,
  levelling plans, GE search/charts, shopping lists, goals, source status,
  updates, settings, optional-AI preview, and legal/safety views.
- Portable profile JSON import/export and deterministic browser-preview fixtures
  for first-run, returning, offline, and provider-failure states.
- Least-privilege Tauri command bridge restricted to the 48 documented MCP tools
  and a bundled target-specific Node/MCP production sidecar.
- Dark, light, and system themes; compact density; responsive layouts; skip
  navigation; reduced-motion behavior; loading, error, freshness, and retained
  data states.
- React state/form/component tests, eight Playwright user journeys, Rust
  allowlist/error/stdio command tests, Windows NSIS packaging, and manual
  multi-platform bundle CI.

### Security

- Desktop calculations continue through the validated MCP/core boundary rather
  than duplicated UI logic.
- Strict CSP, Tauri prototype freezing, one local window capability, sanitized
  native errors, no shell interpolation, and no credentials or game-client
  access.
- Failed provider refreshes retain the last valid local catalogue and remain
  visible with source timestamps.

## [0.4.0] - 2026-07-23

### Added

- Searchable RS3 Grand Exchange catalogue with normalized aliases, current guide
  prices, previous prices, buy limits, alchemy values, and daily volume where
  the source publishes them.
- Official Jagex 180-day guide-price history with range filtering, percentage
  changes, moving averages, daily-return volatility, historical highs/lows,
  statistical outliers, and chart-ready output.
- Overflow-safe item-list, equipment, quest-shopping, and optional
  training-material valuation.
- JSON and spreadsheet-safe CSV price exports returned through MCP without
  arbitrary filesystem writes.
- Additive migration 4 for item catalogue, aliases, historical points, and safe
  synchronization status.
- Fourteen Grand Exchange MCP tools, bringing the local stdio surface to 48
  tools.
- Provider-contract, analytics, migration, MCP-schema, failure-path, export, and
  end-to-end tests plus expanded opt-in live price smoke tests.

### Security

- Bulk snapshots are runtime-validated and transactionally applied; malformed,
  duplicate, or suspiciously truncated results cannot replace retained data.
- Quantity multiplication and totals reject unsafe integer overflow.
- Public RS3 sources do not publish an instant order book, so unavailable
  buy/sell high/low prices remain explicit and no guaranteed-profit claim is
  generated.

## [0.3.0] - 2026-07-23

### Added

- Exact standard and elite Invention XP curves, current true skill caps, level
  99/110/120 targets, and explicit virtual-level support.
- Revision-aware RuneScape Wiki training provider covering all 29 skills,
  rendered dynamic tables, XP/GP ranges where published, uncertainty, and
  provenance.
- Transactional SQLite training catalogue and safe synchronization status in
  additive migration 3.
- Fastest, cheapest, balanced, and AFK multi-stage planning with quest,
  membership, Ironman, budget, daily-time, and target-date constraints.
- Weekly goals, time/cost estimates, training comparisons, and quest-XP reward
  comparisons.
- Ten levelling MCP tools, bringing the local stdio surface to 34 tools.
- Deterministic parser, planner, migration, MCP, and end-to-end tests plus an
  opt-in live training-provider smoke test.

### Security

- Malformed, duplicate, empty, implausible-rate, and suspiciously truncated
  training snapshots cannot replace the last valid catalogue.
- Missing rates and costs remain unknown instead of being inferred or
  fabricated; all planning stays read-only with respect to RuneScape.

## [0.2.0] - 2026-07-23

### Added

- Revision-aware RuneScape Wiki quest provider using Bucket and MediaWiki APIs.
- Transactional SQLite quest catalogue, aliases, content hashes, provenance, and
  safe sync-status records in migration 2.
- Deterministic prerequisite traversal, cycle detection, alternative branches,
  requirements, available quests, routes, recommendations, and shopping lists.
- Manual single and bulk completed/in-progress/not-started profile status.
- Thirteen quest MCP tools, bringing the local stdio surface to 24 tools.
- Unit, provider contract, migration, MCP integration, failure-path, and
  end-to-end quest-flow tests plus an opt-in live Wiki smoke test.

### Security

- Empty, malformed, duplicate, ambiguous, and suspiciously truncated snapshots
  cannot replace the last valid quest catalogue.
- External quest data remains read-only and cannot control the RuneScape client.

## [0.1.0] - 2026-07-23

### Added

- Strict pnpm TypeScript monorepo and runtime domain validation.
- Deterministic RuneScape XP calculations through virtual level 126.
- SQLite player profiles, profile import/export, migrations, and persistent cache.
- Resilient Jagex Hiscores and Grand Exchange ItemDB providers.
- Cache-first stale-while-revalidate behavior with provenance and timestamps.
- Eleven structured tools on the official MCP SDK stdio transport.
- Claude Desktop, Claude Code, and LM Studio configuration examples.
- Fixture-based tests, optional live smoke tests, and GitHub Actions CI.
- Architecture, data-source, tool, security, contribution, and roadmap documents.

### Known limitations

- No quest, training-method, price-history, desktop, local-agent, or hosted-MCP
  implementation yet. These remain explicitly versioned roadmap work.
