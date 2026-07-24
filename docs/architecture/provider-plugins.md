# Provider plugin architecture

The provider registry sits between application composition roots and the
existing narrow core ports.

```text
MCP / hosted composition
        |
ProviderPortAdapter
        |
ProviderRegistry ---- health snapshot
   |      |      |
priority validation fallback
   |      |      |
built-in or third-party outward adapters
```

The registry owns metadata, priority, fallback, offline eligibility, shared
result validation, disagreement records, request attempts, and health
telemetry. It does not own calculations or persistence.

`ProviderPortAdapter` still satisfies `PlayerStatsProvider`,
`GrandExchangeDataProvider`, `QuestDataProvider`, and
`TrainingMethodProvider`. Core services therefore remain provider-agnostic.
The default factory wires Jagex and RuneScape Wiki adapters; contributors can
register another plugin at the composition root.

Concurrent requests are coalesced at two levels: the stale-while-revalidate
cache locks by semantic cache key, while `ResilientHttpClient` coalesces an
identical in-flight URL and returns independent response clones.

Provider health is operational evidence, not an authority score. A degraded
source may still return a valid result; priority remains explicit configuration.
