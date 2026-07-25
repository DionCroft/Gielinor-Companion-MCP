# Health and diagnostics

Version 1.1 adds one central, local health model for the stdio MCP server,
desktop application, and hosted operator runtime. Reading health does not probe
RuneScape providers. It aggregates recorded database, provider,
circuit-breaker, catalogue, scheduler, update-checker, error, and recovery
state.

## Overall states

| State        | Meaning                                                         |
| ------------ | --------------------------------------------------------------- |
| `healthy`    | Required components and current local data are available        |
| `degraded`   | A valid fallback or stale snapshot is in use                    |
| `recovering` | A bounded automatic recovery is active                          |
| `offline`    | Network work is disabled and retained local data remains usable |
| `safe-mode`  | Database writes and background maintenance are restricted       |
| `critical`   | A required capability has no valid fallback                     |

Component details retain timestamps, stable error codes, circuit states, record
counts, last successes, last failures, and next scheduled work. Diagnostics
rows are bounded to the latest 500 errors and 500 recovery events.

## Desktop actions

The Diagnostics centre can re-read central health, refresh one validated
catalogue, retry a failed refresh through the persistent scheduler, run
SQLite's read-only `quick_check`, export redacted diagnostics, open
troubleshooting documentation, show offline/safe-mode state, and open the
read-only software update checker. It can also remove only cache-quarantine
records older than the 30-day retention cutoff and reset one selected provider
circuit after an explicit confirmation dialog.

The page has no “reset everything” operation. Database restore, quarantine
restore, and any action that could discard user-created information remain
explicit backup-first repair workflows.

## Redacted export

The export includes application and contract versions, operating system and
Node.js details, component health, safe configuration, stable errors, recovery
history, scheduler status, and up to 200 sanitised log records.

It excludes credentials, authentication headers, cookies, private identifiers,
profiles, databases, raw provider responses, prompts, absolute paths, and stack
traces. Values are parsed through a strict shared schema after redaction.

## Hosted boundary

Diagnostics and maintenance MCP methods are operator-only in the hosted
service. This prevents one tenant from observing shared operational history.
Anonymous and account actors retain the Version 1.0 public/profile boundaries.
