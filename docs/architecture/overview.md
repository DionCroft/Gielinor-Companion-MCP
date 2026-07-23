# Version 0.2 architecture

## Boundaries

`@gielinor/shared-types` owns domain Zod schemas and stable vocabulary.
`@gielinor/core` owns deterministic XP and quest-graph rules, application
services, and ports. `@gielinor/providers` implements public API adapters,
resilient caching, and the RuneScape Wiki quest adapter. `@gielinor/database`
implements SQLite profile, cache, quest-catalogue, alias, and sync-status ports.
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

## Local data

SQLite migration 1 creates `player_profiles` and `provider_cache`. Migration 2
adds `quests`, `quest_aliases`, and `quest_sync_status`; it does not alter or
rewrite Version 0.1 profiles. Profiles and quests are stored as schema-validated
JSON plus searchable metadata. The cache stores validated adapter results with
fresh and stale deadlines. WAL mode and a busy timeout are enabled for
file-backed databases.

Profile export intentionally excludes local profile and goal UUIDs. Import creates
new UUIDs and accepts only schema version 1.

## Safety

No layer communicates with a RuneScape client. Provider URLs are public read-only
services. Profile mutations affect companion-local SQLite only. The MCP process
writes protocol messages to stdout and diagnostics to stderr.

## Future extension

Training ports will be added in Version 0.3. Hosted transport, agent runtimes,
and UIs must compose the same services; they must not reimplement calculations
or quest graph traversal.
