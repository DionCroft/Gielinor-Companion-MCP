# Gielinor Companion MCP

> An open-source, AI-compatible RuneScape 3 quest, levelling and Grand Exchange
> companion.

[![CI](https://github.com/DionCroft/Gielinor-Companion-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/DionCroft/Gielinor-Companion-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Gielinor Companion MCP is a safe, model-independent foundation for deterministic
RuneScape 3 planning. Version 0.1 provides public Hiscores, local player profiles,
XP calculations, current Jagex Grand Exchange guide prices, and a standards-based
stdio MCP server. It never controls the game client.

## Release status

**Current version: 0.1.0 — Foundation.** This is an early working release. Quest
planning begins in 0.2; the desktop interface, local Ollama/LM Studio chat runtime,
and hosted MCP are roadmap work and are not represented as complete.

There are no interface screenshots yet because 0.1 is a headless MCP release.

## Features

- Strict TypeScript and Zod domain schemas for profiles, skills, quests, training
  methods, goals, requirements, and GE items.
- Multiple local player profiles in SQLite; no Jagex login or credentials.
- Public normal, Ironman, and Hardcore Ironman Hiscores adapters.
- Deterministic levels 1–126, including level 99 and 120 targets.
- Jagex ItemDB current guide-price lookup by item ID.
- Persistent cache-first, stale-while-revalidate provider data.
- Timeouts, bounded retries, response validation, provenance, and timestamps.
- Eleven local MCP tools over stdio.
- Portable, strict, schema-versioned profile import/export.
- Fixture-based unit and integration tests; live provider tests are opt-in.

## Architecture

```text
Jagex public APIs
        |
        v
provider adapters ---- persistent provider cache
        |
        v
domain ports + core services ---- SQLite profile repository
        |
        v
MCP tool service ---- stdio transport ---- MCP client
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

The shared Ollama agent runtime is planned for 0.6. Version 0.1 does not claim
direct Ollama tool-loop support. An MCP-capable third-party Ollama host may launch
the same stdio command, but is outside this release's tested surface.

### Standalone desktop

The Tauri desktop application and non-AI dashboard are planned for 0.5. They are
not included in the headless 0.1 release.

### ChatGPT-compatible remote MCP

Hosted Streamable HTTP transport is planned for 0.7. Version 0.1 exposes local
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

Every result is JSON and includes generation/source metadata. Full contracts,
examples, and error cases are in [the MCP tool reference](docs/mcp-tools/README.md).

## Development

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

Optional live smoke tests make real public API requests:

```sh
RUN_LIVE_API_TESTS=1 corepack pnpm test:live
```

On PowerShell:

```powershell
$env:RUN_LIVE_API_TESTS = "1"
corepack pnpm test:live
```

Normal CI never requires live services. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Data sources and freshness

- **Player stats:** Jagex public Hiscores. Default fresh period: 15 minutes.
- **Current item guide price:** Jagex Grand Exchange ItemDB. Default fresh period:
  5 minutes.
- **XP thresholds:** deterministic RuneScape XP formula, generated locally.

Responses distinguish fresh, stale, and newly fetched data. A stale validated
record may be served temporarily while refresh happens; malformed responses never
replace it. Prices are guide values, can be delayed, and are not guaranteed trade
prices. See [data-source assumptions and risks](docs/data-sources/version-0.1.md).

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
