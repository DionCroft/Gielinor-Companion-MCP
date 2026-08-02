# Real-data flow

Version 1.1 separates runtime selection, public provider data and private local
state so a fixture can never be mistaken for a RuneScape account snapshot.

## Runtime modes

| Mode                       | Bridge and data boundary                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `native-real`              | Supported Tauri invoke API, bundled/current MCP sidecar and local SQLite. A demo bridge is forbidden.                                           |
| `browser-live-development` | Standalone browser mode clearly reports that real tools are unavailable and requires `corepack pnpm desktop:dev`; fixtures are not substituted. |
| `browser-preview`          | Explicit deterministic fixtures with a persistent `Preview data — not connected to RuneScape or your local profile.` banner.                    |
| `automated-test`           | Explicit test flag or query parameter and deterministic fixtures.                                                                               |

Normal browser startup does not infer preview or test mode. Native development
selects the built MCP runtime, not a previously generated sidecar.

## Public data path

1. A strict MCP request enters the local server.
2. The selected profile ID is resolved explicitly.
3. The provider registry chooses an adapter for one capability.
4. Bounded HTTP retries, per-provider circuit state and schema validation run.
5. A validated snapshot replaces the matching SQLite catalogue transactionally.
6. If refresh fails, a still-valid last-known-good snapshot may be retained and
   labelled cached or stale. Invalid input is quarantined and never activated.
7. The tool envelope returns a timestamp, source and trace ID.

The public providers are:

- Jagex Hiscores for public levels, XP, rank, totals and supported activities;
- RuneScape Wiki revision/Bucket data for quests and training methods;
- RuneScape Wiki/Weird Gloop catalogue data for RS3 item metadata, guide prices,
  limits and published volume;
- Jagex ItemDB detail and graph endpoints for item detail and daily guide history;
- Weird Gloop RS3 exchange history for independent price/volume observations;
- Weird Gloop's RuneScape Wiki social feed for source-backed news items.

OSRS real-time high/low APIs are not consumed as RS3 data.

## Truth states

Every user-facing result must be identifiable as one of: live public data,
retained cached data, user-entered local data, read-only screen-derived data
awaiting confirmation, explicit preview/test fixture data, or unavailable.
Missing fields remain missing and produce a warning; they are never filled with
plausible-looking values.

Hiscores are public snapshots. They are not a logged-in account connection and
require no Jagex password, token, cookie or authenticator code. Public APIs do
not expose a complete bank, inventory, equipment setup, active GE offers or
authoritative quest completion state.

## First run and offline operation

The desktop runs eleven sequential stages: database validation, profile creation,
Hiscores refresh, check/refresh for quests, check/refresh for training,
check/refresh for GE data, coverage validation and dashboard opening. Each
optional catalogue can fail independently; retry and limited mode preserve all
other valid data.

Backend-enforced offline mode persists in SQLite. While enabled, providers and
the scheduler make no network calls. Cached data remains readable with its age,
live-only refreshes return a structured offline error, and stale evidence lowers
market confidence.

See also [provider plugins](provider-plugins.md),
[resilience](resilience.md) and [GE market data](../data-sources/ge-market-data.md).
