# Provider plugin architecture

Version 1.0 stabilizes this interface as provider plugin API version `1`.
Plugins must declare `apiVersion: PROVIDER_PLUGIN_API_VERSION`; unsupported
versions are rejected atomically before capability metadata or health state is
registered.

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

Within provider API v1, additive optional metadata may be introduced in a minor
release. Removing a capability, changing a handler request/result, changing
priority semantics, or making metadata required needs a new major provider API.
Package semantic version and provider API version are related but independent.

Concurrent requests are coalesced at two levels: the stale-while-revalidate
cache locks by semantic cache key, while `ResilientHttpClient` coalesces an
identical in-flight URL and returns independent response clones.

Provider health is operational evidence, not an authority score. A degraded
source may still return a valid result; priority remains explicit configuration.
