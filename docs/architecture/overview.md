# Stable architecture

Version 1.1 preserves every Version 1.0 boundary and adds shared structured
errors, provider resilience, cache quarantine, verified database recovery,
persistent automatic maintenance, central diagnostics, and a read-only update
checker. See [resilience](resilience.md), [scheduler](scheduler.md),
[diagnostics](diagnostics.md), and [update checker](update-checker.md).

## Boundaries

`@gielinor/shared-types` owns domain Zod schemas, the stable 48-tool order,
profile export version, and generated public contract vocabulary.
`@gielinor/core` owns deterministic XP, quest-graph, levelling-planner, and
price-analytics rules,
application services, and ports. `@gielinor/providers` implements public API
adapters, resilient caching, and RuneScape Wiki quest/training adapters.
`@gielinor/database` implements SQLite profile, cache, quest, training, GE
catalogue/history, alias, and sync-status ports. `@gielinor/mcp-server` composes
dependencies and exposes stdio tools. `@gielinor/hosted-server` composes those
same services behind stateless Streamable HTTP, policy enforcement, and isolated
account storage. `@gielinor/desktop` is a Tauri/React client that reaches those
same tools through a least-privilege native stdio bridge.
`@gielinor/agent-runtime` is a model-independent orchestrator for optional local
providers; it depends only on shared tool contracts and an injected executor.
`@gielinor/alt1-overlay` is an optional static outward adapter. It reads only
consented visible-main-chat pixels through Alt1 and has no dependency on, or
authority over, the trusted core.

Dependencies point inward:

```text
shared-types <- core <- providers
                    <- database
shared-types/core/providers/database <- mcp-server
                                      <- hosted-server <- remote MCP clients
                                      <- desktop bridge <- React views
shared-types <- agent-runtime --------------------^
                    ^                     |
                    |                     v
             Ollama / LM Studio    trusted tool executor

guidance pack -> alt1-overlay <- visible main-chat pixels
                       |
                       v
             local read-only guidance
```

The database package also implements the provider package's cache-storage
interface. It contains no provider parsing or game recommendation logic.

## Request path

1. MCP validates tool arguments.
2. The tool service calls one core service or provider port.
3. Provider adapters create a configured URL and use the resilient HTTP client.
4. External text/JSON is parsed and runtime validated.
5. Only validated domain objects enter the persistent cache or core.
6. MCP returns a small JSON envelope with source and generation timestamps.

Provider refresh failures retain an existing valid record. Fresh records are
served immediately; stale records may be served while one deduplicated background
refresh runs. Expired records require a successful refresh.

## Stable public contracts

Version 1.0 declares four independently versioned boundaries:

- MCP tool contract `1.0`: exact names, strict inputs, effect metadata, common
  success envelope, and safe public error envelope;
- profile export schema `1`: portable user data with a tested legacy-v0
  migration;
- provider plugin API `1`: typed capabilities, metadata, routing, validation,
  offline behavior, and health;
- SQLite schema `5`: forward-only named migrations with transactional
  `user_version` updates.

`data/contracts/mcp-tools-v1.json` is generated from the shared definitions used
by the local model runtime. `data/schemas/profile-export.schema.json` publishes
the portable profile shape. Contract changes follow semantic versioning;
database/profile data changes require explicit migrations and fixtures.

## Quest synchronization

The Wiki quest adapter combines three independently validated inputs:

1. Bucket `quest`, `quest_rewards`, and `infobox_quest` rows for structured facts.
2. `Module:Questreq/data` for direct prerequisite relationships.
3. MediaWiki revisions for individual quest pages and the prerequisite module.

It normalizes only factual fields needed by the companion, preserves the
canonical source and guide links, and computes a SHA-256 content hash that omits
check timestamps and revision-only changes. The database compares hashes to
classify inserts, changes, and unchanged pages. A revision can therefore advance
without rewriting the record as changed when its structured facts are identical.

The complete candidate snapshot is runtime-validated before entering one SQLite
transaction. Alias ambiguity, duplicate IDs, empty results, malformed rows, and a
drop below 80% of an existing catalogue with at least 20 records are rejected.
The last valid quest rows and last-success metadata survive a failed attempt.

## Quest planning

`QuestService` resolves canonical names and aliases, applies profile-local manual
statuses, evaluates known quest/skill/quest-point requirements, and traverses a
prerequisite graph. A depth-first topological walk orders prerequisites before
the target and rejects cycles. `any` groups retain all alternatives and select
the lowest-cost currently unsatisfied branch. Shopping lists aggregate
case-insensitive duplicate items across remaining route quests.

## Training synchronization

The training adapter maps the current members' training guides to all 29 skill
IDs. It combines exact revision wikitext with rendered HTML for the same oldid:
wikitext supplies stable summary/section structure, while rendered HTML resolves
dynamic template expressions. Batches of five bound rendered-page concurrency.

Rows become source-revisioned `TrainingMethod` objects only after level, range,
rate, provenance, and plausibility validation. Missing rates are representable
and block estimates rather than receiving guessed values. The complete snapshot
must cover all skills. Duplicate IDs, empty data, and suspicious truncation fail
before one transactional replacement.

## Levelling planning

`LevellingPlannerService` reads a profile and the last valid training snapshot.
It uses exact XP thresholds to divide a target into level intervals, selects an
accessible method for each interval, and merges adjacent selections into stages.
Strategies are deterministic:

- fastest uses the conservative published XP/hour minimum;
- cheapest uses known GP/XP or derives it from published GP/hour, falling back
  with a warning only when no cost data exists;
- AFK prioritizes source-derived AFK rating and then rate;
- balanced weighs conservative rate, attention, and known cost.

Each stage calculates best/worst hours and cost/profit where supported. The final
plan applies GP budget, hours/day, target-date, true-cap/virtual, quest,
membership, skill, and Ironman constraints. It retains uncertainty notes and
never infers inventory or equipment ownership.

## Grand Exchange synchronization and analytics

`JagexGrandExchangeProvider` validates three distinct public contracts. The
official Jagex detail endpoint retains the backward-compatible single-ID lookup;
the RuneScape Wiki Grand Exchange Market Watch dump supplies the searchable
catalogue, Jagex timestamp, limits, alchemy values, and latest daily volume; the
official Jagex graph supplies up to 180 ordered daily guide-price points and its
published 30-day average.

`GrandExchangeService` computes range changes, 7/30/90-point moving averages,
population standard deviation of daily percentage returns, historical
highs/lows, and 2.5-standard-deviation outliers. These calculations are pure and
recalculable. They never reinterpret a guide price as an instant trade.

Catalogue candidates are completely validated before one transaction. An
existing catalogue rejects a replacement below 80% of its size, and the live
provider independently rejects fewer than 1,000 items. History is cached for six
hours; on a provider failure, validated history no more than seven days old may
be returned with an explicit stale warning.

Valuation resolves IDs or aliases, aggregates duplicates, protects every
multiplication and sum against unsafe integer overflow, preserves unpriced
lines, and reports completeness. CSV/JSON exports are returned as MCP content
and never write a caller-selected path.

## Local data

SQLite migration 1 creates `player_profiles` and `provider_cache`. Migration 2
adds `quests`, `quest_aliases`, and `quest_sync_status`. Migration 3 adds
`training_methods` and `training_sync_status`. Migration 4 adds `ge_items`,
`ge_item_aliases`, `ge_price_history`, and `ge_sync_status`. Migration 5 adds
operational lookup/age indexes without rewriting data. Migrations are additive
and do not rewrite earlier profile, quest, or training JSON. Domain
objects are stored as validated JSON plus searchable metadata. The cache stores
validated adapter results with fresh and stale deadlines. WAL mode and a busy
timeout are enabled for file-backed databases.

Profile export intentionally excludes local profile and goal UUIDs. Import
creates new UUIDs, emits schema version 1, and can migrate the documented legacy
version-0 fixture through a copied, validated migration chain.

## Provider plugin boundary

The application composition roots create a `ProviderRegistry`, register the
built-in Jagex/Wiki plugin, and pass a `ProviderPortAdapter` to unchanged core
services. Each capability carries source identity, version, integer priority,
offline support, and a typed handler. Shared schemas validate successful
results. Failed or malformed high-priority providers fall back in deterministic
order; optional comparison mode retains each incompatible result.

Health tracks per-capability attempts, latency, consecutive failures, and safe
error codes. Offline routing skips network-only snapshot refresh and permits
retained Hiscores/GE cache reads without starting HTTP. Identical in-flight HTTP
URLs and cache refresh keys are independently coalesced.

## Desktop boundary

The React UI contains presentation state and strict forms, not domain
calculations. Tauri accepts only a documented tool name and JSON arguments,
rejects everything outside the generated 93-tool allowlist (including the
frozen 48-tool Version 1.0 prefix), and starts the bundled MCP runtime without a
shell. Each call performs MCP initialization and a structured tool call over
stdio, then terminates its child process. Native errors are mapped to path-free
public messages.

Production preparation uses `pnpm deploy` to build a flattened dependency tree
and copies the current target's Node executable as a Tauri external sidecar.
Generated runtime, target, and installer files are ignored. The main window has
`core:default`, a strict CSP, and prototype freezing. It receives no generic
filesystem, shell, or process capability. Tauri's HTTP plugin is narrowed by an
ACL to loopback HTTP URLs only.

Browser preview and Playwright use deterministic fixtures and never replace
native command tests. User profiles and provider catalogues continue to use the
same SQLite file as the headless MCP server.

## Local agent boundary

The 48 MCP input schemas now live in `@gielinor/shared-types`. MCP registration
and the model-facing JSON function schemas therefore derive from the same Zod
contracts. `@gielinor/agent-runtime` accepts a provider adapter and a companion
tool executor; it contains no XP, quest, training, or price calculations.

Ollama uses `/api/tags`, `/api/show`, and `/api/chat`. Discovery filters out
models whose capability metadata does not include tool use. LM Studio uses the
OpenAI-compatible `/v1/models` and `/v1/chat/completions` contracts. Both
adapters normalize provider-specific messages into one internal conversation
format.

Each model call has an overall 1–120 second timeout and a configurable 1–10
tool-loop bound. A turn can request no more than eight tools. Input is parsed by
the selected shared Zod schema before the executor runs; output must be a valid
source-stamped `ToolEnvelope` before it is returned to the model. Unknown names,
bad inputs, rejected outputs, and executor errors become explicit failed tool
messages. Parallel calls use `Promise.all` only for adapters that declare that
capability.

The desktop uses Tauri's Rust-backed HTTP client, avoiding webview CORS
configuration. Runtime endpoint parsing and Tauri ACL scopes independently
restrict requests to `localhost`, `127.0.0.1`, or `::1`; credentials, query
strings, remote hosts, redirects, and cloud API keys are not accepted.
Conversations remain in memory. Only non-secret provider choice, endpoints,
model name, timeout, and loop preferences are stored in local UI storage.

## Hosted boundary

`@gielinor/hosted-server` creates one MCP server and stateless
`StreamableHTTPServerTransport` for each protocol request. This avoids
cross-request session state while keeping MCP initialization, tool discovery,
and tool-call responses standards-compliant. It imports the existing MCP server
library and never re-registers or reimplements the 48 tool contracts.

The HTTP boundary validates Host and any Origin before authentication. Production
can require a trusted proxy's HTTPS indication; the direct listener should remain
on loopback or a private container network. JSON bodies, protocol-message count,
requests per minute, and tool calls per minute are independently bounded.
Responses carry no-store and browser-hardening headers. Logs contain request
metadata and actor class only, with no bodies, tokens, profile data, provider
responses, paths, or stacks.

Anonymous sessions use an unavailable profile repository. Authenticated tokens
resolve through `control.db`, which stores only token digests and account state.
The validated account UUID selects exactly one file below `accounts/`; quest,
training, GE, and provider-cache repositories continue to use `public.db`.
Consequently, a valid profile UUID from a different account still produces
`NOT_FOUND`. Operator authentication can refresh shared datasets but cannot
select private account storage.

Account export reuses the strict schema-versioned profile export. Deletion first
makes the token non-authenticating, removes only the three exact SQLite files for
that account, and then deletes the control row. Failed file removal restores the
active state rather than claiming success.

## Optional overlay boundary

`@gielinor/alt1-overlay` is a browser-only static app with no network client.
Its CSP denies all outgoing connections. The audited Alt1 JavaScript dependency
is pinned to 0.1.3, and the capture controller requires Alt1 1.6.0 or later.
The app manifest declares only `pixel,overlay`; it contains no activators or
request handlers.

Consent is stateful but capture is not implicit. Every field begins off, policy
acknowledgement enables only selected categories, and a separate Connect action
starts reads. Capability, permission, runtime version, and RuneScape linkage are
checked before each capture. Pause, disconnect, permission loss, or revoke
clears the reader binding and named overlay group.

The Alt1 driver uses the upstream `ChatBoxReader` to locate and OCR visible main
chat. Raw pixels and lines remain transient. Before analysis, control characters
and timestamps are removed; player/private-chat-shaped lines are rejected; URLs,
emails, addresses, and long identifiers are redacted; output is bounded. The
analyser matches only a local schema-versioned guide pack and labels every
result by source and confidence.

Completion messages are always probable signals. Confirmation creates only an
in-memory `local-confirmation-only` record and cannot invoke an MCP tool, change
a companion profile, or affect RuneScape. Manual pasted-text mode uses the same
pipeline and preserves a complete fallback when Alt1 is absent.

## Safety

No layer sends commands to a RuneScape client. The optional overlay can observe
only visible pixels through Alt1 after consent and can draw only unclickable
guidance; it cannot click, type, read memory, intercept packets, or transmit
captured data. Game-data provider URLs are public read-only services; optional
model traffic remains on loopback. Profile mutations affect companion-owned
local or hosted SQLite only. The stdio MCP process writes protocol messages to
stdout and diagnostics to stderr; the hosted process writes privacy-preserving
JSON operational events to stdout.

## Post-1.0 extension

Later transports or overlay bridges must preserve these boundaries. They must
not reimplement calculations, quest graph traversal, levelling selection, price
analytics, valuation, tool validation, or add gameplay input.
