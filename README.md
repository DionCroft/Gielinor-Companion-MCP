# Gielinor Companion MCP

> An open-source, AI-compatible RuneScape 3 quest, levelling and Grand Exchange
> companion.

[![CI](https://github.com/DionCroft/Gielinor-Companion-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/DionCroft/Gielinor-Companion-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Gielinor Companion MCP is a safe, model-independent foundation for deterministic
RuneScape 3 planning. Version 0.3 provides public Hiscores, local player profiles,
authoritative standard and Invention XP calculations, revision-aware quest and
training data, multi-stage levelling plans, current Jagex Grand Exchange guide
prices, and a standards-based stdio MCP server. It never controls the game client.

## Release status

**Current version: 0.3.0 — Levelling Planner.** This is an early working release.
The desktop interface, local Ollama/LM Studio chat runtime, and hosted MCP are
roadmap work and are not represented as complete.

There are no interface screenshots yet because 0.3 remains a headless MCP release.

## Features

- Strict TypeScript and Zod domain schemas for profiles, skills, quests, training
  methods, goals, requirements, and GE items.
- Multiple local player profiles in SQLite; no Jagex login or credentials.
- Public normal, Ironman, and Hardcore Ironman Hiscores adapters.
- Exact standard levels 1–126 and Invention levels 1–150, true skill caps,
  virtual targets, and current level 99/110/120 boundaries.
- Jagex ItemDB current guide-price lookup by item ID.
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
- Thirty-four local MCP tools over stdio.
- Portable, strict, schema-versioned profile import/export.
- Fixture-based unit and integration tests; live provider tests are opt-in.

## Architecture

```text
Jagex public APIs ---- provider cache
RuneScape Wiki  ----- revision-aware quest/training sync
                              |
                              v
domain ports + core services ---- SQLite profiles/quests/training
                              |
                              v
                MCP tool service ---- stdio MCP client
```

Business rules are in `packages/core`. Provider parsing, SQLite, and MCP transport
depend on those ports; the core never depends on a UI or model vendor. See
[the architecture overview](docs/architecture/overview.md).

## Requirements

- Node.js 20 or later
- Corepack (included with supported Node distributions)
- A C++ build toolchain only if a prebuilt `better-sqlite3` binary is unavailable

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
does not contain LM Studio-specific behavior.

### Ollama

The shared Ollama agent runtime is planned for 0.6. Version 0.3 does not claim
direct Ollama tool-loop support. An MCP-capable third-party Ollama host may launch
the same stdio command, but is outside this release's tested surface.

### Standalone desktop

The Tauri desktop application and non-AI dashboard are planned for 0.5. They are
not included in the headless 0.3 release.

### ChatGPT-compatible remote MCP

Hosted Streamable HTTP transport is planned for 0.7. Version 0.3 exposes local
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
corepack pnpm test:database
corepack pnpm test:e2e
```

Optional live smoke tests make real public API requests and remain outside
deterministic CI:

```sh
corepack pnpm test:live
corepack pnpm test:live:hiscores
corepack pnpm test:live:itemdb
corepack pnpm test:live:wiki
corepack pnpm test:live:training
```

Normal CI never requires live services. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Data sources and freshness

- **Player stats:** Jagex public Hiscores. Default fresh period: 15 minutes.
- **Current item guide price:** Jagex Grand Exchange ItemDB. Default fresh period:
  5 minutes.
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
[Version 0.3](docs/data-sources/version-0.3.md) data-source notes.

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
