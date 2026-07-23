# Version 0.1 architecture

## Boundaries

`@gielinor/shared-types` owns domain Zod schemas and stable vocabulary.
`@gielinor/core` owns deterministic XP rules, application services, and ports.
`@gielinor/providers` implements public API adapters and resilient caching.
`@gielinor/database` implements SQLite profile and cache ports.
`@gielinor/mcp-server` composes dependencies and exposes stdio tools.

Dependencies point inward:

```text
shared-types <- core <- providers
                    <- database
shared-types/core/providers/database <- mcp-server
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

## Local data

SQLite migration 1 creates `player_profiles` and `provider_cache`. Profiles are
stored as schema-validated JSON plus searchable metadata. The cache stores
validated adapter results with fresh and stale deadlines. WAL mode and a busy
timeout are enabled for file-backed databases.

Profile export intentionally excludes local profile and goal UUIDs. Import creates
new UUIDs and accepts only schema version 1.

## Safety

No layer communicates with a RuneScape client. Provider URLs are public read-only
services. Profile mutations affect companion-local SQLite only. The MCP process
writes protocol messages to stdout and diagnostics to stderr.

## Future extension

Quest and training ports will be added to core in the versions that consume them.
Hosted transport, agent runtimes, and UIs must compose the same services; they
must not reimplement calculations.
