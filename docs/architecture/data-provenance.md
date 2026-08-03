# Data provenance

Version 1.2.0 uses one machine-readable classification for every user-facing
result, inherited from its enclosing MCP response where a leaf value does not
repeat it:

| Origin            | UI badge       | Meaning                                                                    |
| ----------------- | -------------- | -------------------------------------------------------------------------- |
| `live-public`     | Live           | A real public provider succeeded during the current request.               |
| `validated-cache` | Cached         | A previously validated provider snapshot was read locally.                 |
| `manual-local`    | Manual         | The player entered or confirmed local private state.                       |
| `imported-local`  | Imported       | A user-approved CSV or JSON import supplied the value.                     |
| `alt1-confirmed`  | Alt1 confirmed | Visible-interface recognition was reviewed and confirmed before saving.    |
| `derived`         | Calculated     | Deterministic code calculated the result from classified inputs.           |
| `preview-fixture` | Preview        | An explicit browser preview or automated test supplied deterministic data. |
| `unavailable`     | Unavailable    | No trustworthy value is available.                                         |

`DataProvenance` also records provider/source name, retrieval or entry time,
freshness, cache state, optional deterministic confidence, warnings, and trace
ID. A calculated value inherits the weakest relevant freshness/confidence and
retains warnings from its inputs. A stored provider snapshot is Cached even if
the original fetch was once live. Manual and imported values can never be
promoted to Live.

The MCP envelope is the authoritative inheritance boundary. Desktop badges
render this metadata consistently on profiles, skills, quest planning,
levelling, Grand Exchange analysis, private-data workflows, and Data Sources.
Redacted provenance export excludes display names, profile identifiers,
holdings, trades, credentials, provider payloads, and local paths.

## Production and preview boundary

The native production entry imports only `native-bridge.ts`. Preview fixtures
require both an explicit `browser-preview` or `automated-test` selection and a
preview-enabled build. The production build verifier traverses the emitted
bundle and fails if `DemoCompanionBridge`, `demoProfile`, fixture catalogue
markers, or preview-only fake values are reachable.

Browser live-development never guesses that it is a test and never substitutes
fixtures. It directs developers to `corepack pnpm desktop:dev` when a real local
bridge is required. Every explicit preview page permanently displays:

> Preview data — not connected to RuneScape or your local profile.

See [the real-data flow](real-data-flow.md) for provider and cache boundaries.
