# Live-data audit

Audit date: 2026-08-03

The native application uses the Tauri-to-local-MCP-to-SQLite path. The desktop
never calls fixture providers. Each capability is exposed in **Data sources**
with provider, last success/failure, circuit state, cache age, next refresh,
record count, coverage, origin, warning/error, and a bounded verification action.

| Capability                                             | Native provider/state                                  | Truth boundary                                                               |
| ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Hiscores                                               | Jagex public normal/Ironman/Hardcore endpoints         | Public snapshot of all 29 supported skills; not an authenticated session.    |
| Quest definitions                                      | RuneScape Wiki revision APIs/Bucket data               | Revision-aware, coverage-reported; invalid refresh retains prior valid data. |
| Quest completion                                       | Manual local or confirmed visible-interface suggestion | No supported credential-free provider contract is enabled.                   |
| Training                                               | RuneScape Wiki revisioned guides/tables                | Unsourced numeric rates are excluded from time/cost estimates.               |
| GE catalogue                                           | RuneScape Wiki/Weird Gloop RS3 catalogue               | Guide/catalogue snapshot; absent fields stay unavailable.                    |
| Current guide value                                    | Jagex ItemDB                                           | Not an instant-buy or instant-sell quote.                                    |
| Price history                                          | Jagex graph and Weird Gloop RS3 history                | Daily/public history, not a live order book.                                 |
| News                                                   | Weird Gloop RuneScape news                             | Exact/validated context only; correlation is not causation.                  |
| Software updates                                       | Official GitHub Releases API                           | Read-only metadata; no silent executable installation.                       |
| Holdings, cash, offers, transactions, acquisition cost | Local manual/import/Alt1-confirmed or unavailable      | Never inferred from Hiscores or claimed as Jagex account data.               |

## Quest-status investigation

The historical RuneMetrics `/quests` endpoint was re-tested without credentials
or cookies. On 2026-08-03 it returned a structured quest list for one public
profile but `{"quests":[],"loggedIn":"false"}` for another. The endpoint is
not an official supported API contract, availability depends on account/privacy
state, and the retired website lifecycle has changed. The project therefore
does not treat it as a reliable provider and does not request cookies or Jagex
credentials. Local confirmed status remains authoritative. A future adapter
requires an official/stable contract, live monitoring, explicit display-name
opt-in, complete validation, and user approval before replacing newer manual
state.

The same audit received HTTP 200 from the official public Hiscores endpoint for
`vipergtrkin`; the provider contract validates exactly 29 skill rows and keeps
unranked rows distinct from request failures. The repository provider returned
29 skills, total level 1,500, total XP 14,080,347, and a fresh retrieval time of
2026-08-03T00:23:34.122Z. The dashboard now displays total XP and the Skills view
displays published ranks or an explicit Unranked label.

## Fixture and label regression gates

`test:real-data-boundaries`, `test:no-demo-native`, `test:provenance`, and
`test:live-data-ui` fail for reachable native fixtures, named demo profiles,
mislabelled cached/manual data, absent origin badges, or a missing preview
warning. Optional live provider tests are separate from deterministic pull
request CI and run on a conservative schedule.

## Private fields intentionally unavailable

Public RuneScape APIs do not supply a complete bank, inventory, equipment,
cash pouch, active offers, exact completed trades, acquisition cost, complete
quest state, or current location. The application supports reviewed manual,
CSV, JSON, and optional confirmed Alt1 inputs, and labels missing values
Unavailable. Alt1 remains read-only, opt-in, and confirmation-gated; unreliable
OCR rows are rejected rather than guessed.
