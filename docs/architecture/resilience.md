# Resilience architecture

Version 1.1 applies one shared resilience model across local MCP, hosted MCP,
desktop, providers, SQLite, background maintenance, optional local AI, and the
read-only overlay. Recovery never controls RuneScape, invents game data, or
silently changes a player profile.

## Error and trace boundary

`@gielinor/shared-types` owns the runtime-validated `GielinorError` envelope and
the stable `GC-<DOMAIN>-<NUMBER>` registry. Public conversion removes stack
traces, secrets, headers, payloads, private identifiers, and absolute paths.
Every error receives a UUID trace ID. Cause traversal is bounded.

## Retry policy

Temporary network, timeout, rate-limit, provider, and lock failures may retry
with exponential backoff, bounded jitter, `Retry-After`, cancellation, a maximum
attempt count, and a 120-second default maximum elapsed time. Configuration, authentication,
schema-contract, and validation failures do not retry.

The HTTP client defaults to three total attempts. Scheduler recovery defaults to
five attempts and can be configured from 1 to 20 with
`GIELINOR_MAINTENANCE_MAX_RECOVERY_ATTEMPTS`. A job that reaches its limit enters
`failed`, reports `GC-SCHED-004`, and is excluded from automatic runs until a
manual retry succeeds.

## Providers and circuits

Circuit breakers are scoped by provider and capability. A closed circuit records
successes and retryable failures, opens at the configured threshold, rejects
calls during cooldown, permits one half-open probe, and closes only after a
successful validated response. An unrelated provider remains available.

The registry tries providers in deterministic priority order. Failed, open, or
ineligible providers are recorded as attempts. A fallback result names its
provider; contradictory results are never merged silently.

## Cache and quarantine

Fresh validated cache is returned normally. During a temporary failure, retained
last-known-good data may be returned with a stale status, original timestamps,
failure code, trace ID, and next retry time. Live-only, cross-scope, invalid, or
unsupported records cannot use stale fallback.

Malformed cached or live candidates move to quarantine before they can become
active. Quarantine stores bounded redacted metadata, not raw private payloads.
Cleanup deletes only records older than a confirmed retention cutoff. Active
cache and player data are untouched.

## Database recovery and safe mode

Upgrades create and verify a local backup before migration. Migration writes are
transactional. An interrupted upgrade resumes or restores from the verified
backup; a failed migration rolls back and enters read-only safe mode. Corrupt
files are preserved unchanged.

Safe mode disables background writes and automatic migrations, does not start
optional AI providers, and retains safe read-only data and profile export where
possible. Any repair that could discard user-created data remains manual,
backup-first, and confirmation-gated.

## Observability

The central health service aggregates database, provider, circuit, catalogue,
scheduler, update, error, and recovery state. Automatic and manual recoveries
are persisted. Desktop and MCP diagnostics expose redacted state, explicit stale
or fallback provenance, and safe targeted actions. There is no broad
“reset everything” action.

See also:

- [Scheduler](scheduler.md)
- [Diagnostics](diagnostics.md)
- [Update checker](update-checker.md)
- [Error codes](../errors/error-codes.md)
- [Self-healing](../errors/self-healing.md)
- [Fault injection](../testing/fault-injection.md)
