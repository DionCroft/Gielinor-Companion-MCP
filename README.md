# Gielinor Companion MCP

> An open-source, AI-compatible RuneScape 3 quest, levelling and Grand Exchange
> companion.

[![CI](https://github.com/DionCroft/Gielinor-Companion-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/DionCroft/Gielinor-Companion-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Gielinor Companion MCP is a safe, model-independent foundation for deterministic
RuneScape 3 planning. Version 0.6 adds optional local Ollama and LM Studio
conversations to the accessible Tauri/React desktop application, public
Hiscores, local profiles, quest routes, levelling plans, Grand Exchange
analytics, and standards-based stdio MCP server. It still works without AI and
never controls the game client.

## Release status

**Current version: 0.6.0 — Local AI Providers.** This is an early working
release. Ollama and LM Studio can use the same 48 trusted tools through a bounded
local runtime; hosted MCP remains Version 0.7 roadmap work.

## Features

- Strict TypeScript and Zod domain schemas for profiles, skills, quests, training
  methods, goals, requirements, and GE items.
- Multiple local player profiles in SQLite; no Jagex login or credentials.
- Public normal, Ironman, and Hardcore Ironman Hiscores adapters.
- Exact standard levels 1–126 and Invention levels 1–150, true skill caps,
  virtual targets, and current level 99/110/120 boundaries.
- Searchable 7,000+ item RS3 catalogue with aliases, current guide prices, buy
  limits, alchemy values, and daily volume where published.
- Jagex 180-day price history with percentage change, moving averages,
  daily-return volatility, statistical outliers, historical highs/lows, and
  chart-ready points.
- Overflow-safe inventory, equipment, quest-shopping, and training-material
  valuation plus JSON/CSV export and explicit freshness.
- Persistent cache-first, stale-while-revalidate provider data.
- Timeouts, bounded retries, response validation, provenance, and timestamps.
- RuneScape Wiki quest catalogue with revisions, content hashes, source links,
  aliases, and transactional rollback.
- Prerequisite graph traversal, cycle detection, alternatives, available quests,
  missing requirements, route planning, and aggregated shopping lists.
- Manual completed/in-progress/not-started status in local profiles.
- RuneScape Wiki training guides parsed from revisioned wikitext and rendered
  tables, covering all 29 skills with rate uncertainty and source provenance.
- Fastest, cheapest, balanced, and AFK multi-stage plans with time ranges,
  available GP, daily play time, target dates, quest gates, Ironman checks, and
  explicit missing-data behavior.
- Quest-XP reward comparison and weekly goal schedules.
- Forty-eight local MCP tools over stdio.
- Tauri 2 and React desktop application with first-run setup, multiple profiles,
  skills, quest routes/checklists, levelling plans, GE charts, shopping lists,
  goals, source status, settings, update status, and legal/safety information.
- Bundled least-privilege MCP sidecar, strict CSP, keyboard navigation,
  responsive layouts, system/light/dark themes, offline retained-data status,
  and a complete no-AI mode.
- Portable, strict, schema-versioned profile import/export.
- Shared model-independent agent runtime with Ollama and LM Studio adapters,
  capability-aware model discovery, multi-turn and parallel tool calls, strict
  input/output validation, request timeouts, loop limits, and safe failures.
- Desktop provider selection, loopback-only endpoints, connection testing,
  model selection, in-memory conversation reset, and visible trusted-tool
  activity. No-AI mode remains the default.
- Fixture-based unit, component, native-command, integration, and Playwright
  journey tests; live provider tests are opt-in.

## Architecture

```text
Jagex public APIs ---- price/history cache
RuneScape Wiki  ----- revision-aware quest/training/GE sync
                              |
                              v
domain ports + core services ---- SQLite profiles/quests/training/prices
                              |
                              v
                MCP tool service ---- stdio MCP client
                         |                    ^
                         v                    |
              Tauri command bridge ---- shared agent runtime
                         |                    ^
                         v                    |
                    React desktop ---- Ollama / LM Studio
```

Business rules are in `packages/core`. Provider parsing, SQLite, and MCP transport
depend on those ports; the core never depends on a UI or model vendor. See
[the architecture overview](docs/architecture/overview.md).

## Requirements

- Node.js 20 or later
- Corepack (included with supported Node distributions)
- A C++ build toolchain only if a prebuilt `better-sqlite3` binary is unavailable
- Rust 1.85 or later and platform Tauri prerequisites only for desktop source
  builds

## Quick start

```sh
corepack enable
corepack pnpm install
corepack pnpm build
corepack pnpm start:mcp
```

The last command starts an MCP stdio process and waits for a client. It does not
provide a terminal chat prompt.

Populate or refresh the local quest catalogue without an MCP client:

```sh
corepack pnpm refresh:quests
```

Populate or refresh training methods:

```sh
corepack pnpm refresh:training
```

Populate or refresh the searchable Grand Exchange catalogue:

```sh
corepack pnpm refresh:prices
```

Each versioned refresh command creates its one-time sibling database backup when
needed and verifies that profile rows remain unchanged.

By default, profiles are stored in
`~/.gielinor-companion/gielinor.db`. Override this and other settings with the
variables shown in [.env.example](.env.example). Use a descriptive
`GIELINOR_USER_AGENT` with a contact URL or email when redistributing the server.

## Client setup

Replace `/absolute/path/to/Gielinor-Companion-MCP` with the cloned repository path
and run `corepack pnpm build` first.

### Claude Desktop

Merge [the example configuration](examples/claude-desktop/claude_desktop_config.json)
into Claude Desktop's MCP configuration, then fully restart Claude Desktop.

### Claude Code

Use the tested stdio command documented in
[examples/claude-code/README.md](examples/claude-code/README.md).

### LM Studio

Add [the LM Studio example](examples/lm-studio/mcp.json) to LM Studio's MCP
configuration. LM Studio model support for tool use varies; the MCP server itself
does not contain LM Studio-specific behavior. For the standalone desktop's
direct local provider, start LM Studio's Local Server, then follow the
[local AI setup guide](docs/installation/local-ai.md).

### Ollama

Install a tool-capable model, keep Ollama running at its default loopback
endpoint, then choose **AI providers → Ollama** in the desktop app. The app
discovers only models whose Ollama metadata advertises tool support. See the
[local AI setup guide](docs/installation/local-ai.md).

### Standalone desktop

Version 0.6 includes both the complete no-AI dashboard and optional local AI.
Build and run it from source:

```sh
corepack pnpm build
corepack pnpm desktop:dev
```

Create native installers with `corepack pnpm desktop:build`. The build bundles a
target-specific Node sidecar and production MCP runtime; generated binaries are
not committed. See the [desktop installation guide](docs/installation/desktop.md).

### ChatGPT-compatible remote MCP

Hosted Streamable HTTP transport is planned for 0.7. Version 0.6 exposes local
stdio only and cannot be connected as a remote ChatGPT MCP app.

## MCP tools

- `create_player_profile`
- `get_player_profile`
- `list_player_profiles`
- `get_player_stats`
- `refresh_player_stats`
- `update_player_preferences`
- `export_player_profile`
- `import_player_profile`
- `calculate_xp_remaining`
- `get_skill_progress`
- `get_item_price`
- `search_items`
- `get_item_details`
- `get_item_price_history`
- `get_item_buy_limit`
- `get_item_alchemy_value`
- `get_item_price_summary`
- `compare_item_prices`
- `value_item_list`
- `value_equipment_setup`
- `calculate_quest_shopping_cost`
- `calculate_training_cost`
- `export_price_data`
- `refresh_price_data`
- `get_price_data_status`
- `search_quests`
- `get_quest`
- `get_quest_requirements`
- `get_quest_rewards`
- `get_quest_source`
- `set_quest_status`
- `set_multiple_quest_statuses`
- `list_available_quests`
- `list_missing_quest_requirements`
- `create_quest_route`
- `create_quest_shopping_list`
- `refresh_quest_data`
- `get_quest_data_status`
- `list_training_methods`
- `get_training_method`
- `compare_training_methods`
- `create_levelling_plan`
- `create_weekly_goal_plan`
- `estimate_time_to_level`
- `estimate_cost_to_level`
- `compare_quest_xp_rewards`
- `refresh_training_data`
- `get_training_data_status`

Every result is JSON and includes generation/source metadata. Full contracts,
examples, and error cases are in [the MCP tool reference](docs/mcp-tools/README.md).

## Development

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm test:mcp
corepack pnpm test:providers
corepack pnpm test:ai
corepack pnpm test:database
corepack pnpm test:e2e
corepack pnpm test:desktop
corepack pnpm test:desktop:e2e
corepack pnpm test:desktop:rust
```

Optional live smoke tests make real public API requests and remain outside
deterministic CI:

```sh
corepack pnpm test:live
corepack pnpm test:live:hiscores
corepack pnpm test:live:itemdb
corepack pnpm test:live:wiki
corepack pnpm test:live:training
corepack pnpm test:live:prices
corepack pnpm test:live:ollama
corepack pnpm test:live:lm-studio
```

Normal CI never requires live services. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Data sources and freshness

- **Player stats:** Jagex public Hiscores. Default fresh period: 15 minutes.
- **Current item guide price:** Jagex Grand Exchange ItemDB. Default fresh period:
  5 minutes.
- **Search catalogue, limits, alchemy, and volume:** RuneScape Wiki Grand
  Exchange Market Watch bulk dump, stamped with Jagex's update time and refreshed
  on demand.
- **Historical guide prices:** official Jagex ItemDB graph, cached for 6 hours
  and retained as stale fallback for up to 7 days.
- **XP thresholds and skill caps:** authoritative RuneScape Wiki
  `Experience/Table` revision 37100263. Standard thresholds are generated from
  the game formula; the distinct Invention curve is stored exactly.
- **Quest facts and prerequisites:** RuneScape Wiki Bucket and MediaWiki APIs,
  refreshed on demand with source revisions and content hashes.
- **Training methods and rates:** current RuneScape Wiki members' training
  guides, refreshed on demand from exact revisions. Published ranges are
  retained; unavailable hourly or GP data remains explicitly unknown.

Responses distinguish fresh, stale, and newly fetched data. A stale validated
record may be served temporarily while refresh happens; malformed responses never
replace it. Prices are guide values, can be delayed, and are not guaranteed trade
prices. See the [Version 0.1](docs/data-sources/version-0.1.md) and
[Version 0.2](docs/data-sources/version-0.2.md), and
[Version 0.3](docs/data-sources/version-0.3.md), and
[Version 0.4](docs/data-sources/version-0.4.md) data-source notes.
The desktop and local model adapters do not introduce new RuneScape game-data
providers; see the
[Version 0.5 desktop source behavior](docs/data-sources/version-0.5.md) and
[Version 0.6 local-AI data behavior](docs/data-sources/version-0.6.md).

## Privacy and safety

Profiles are local by default. The application accepts a public display name and
optional planning preferences only. Never enter an email address, password,
authenticator code, token, session cookie, or bank PIN.

The project does not click, type, read client memory, intercept packets, trade,
fight, skill, solve CAPTCHAs, or bypass anti-cheat systems. Read
[SECURITY.md](SECURITY.md) for the acceptable-use and reporting policies.

## Roadmap

[ROADMAP.md](ROADMAP.md) describes the versioned route through quest planning,
levelling plans, GE history, desktop/no-AI use, local model adapters, hosted MCP,
and hardening. Current limitations are explicit in
[docs/roadmap/known-limitations.md](docs/roadmap/known-limitations.md).

## Contributing and licence

Contributions are welcome under the [MIT License](LICENSE). Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Unofficial-project disclaimer

> Gielinor Companion MCP is an unofficial community project and is not affiliated
> with, endorsed by or connected to Jagex Ltd. RuneScape and related marks are
> trademarks of Jagex Ltd.

No copyrighted RuneScape assets are included.
