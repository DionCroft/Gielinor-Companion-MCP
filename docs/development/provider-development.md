# Provider development guide

Providers are outward adapters. They retrieve public data; the core owns
planning, calculations, persistence contracts, and user-facing behavior. A new
provider must not add gameplay input, credentials, client-memory access, packet
inspection, or automated trading.

## Plugin contract

Implement provider plugin API version `1` from `@gielinor/providers`. Every
plugin declares the API version before its capabilities:

- a globally unique lowercase plugin ID and plugin version;
- `apiVersion: PROVIDER_PLUGIN_API_VERSION`;
- one or more typed capabilities;
- an integer priority (higher values are tried first);
- `none`, `cache`, or `full` offline support;
- a human-readable description;
- a handler returning the shared capability result schema.

```ts
import { PROVIDER_PLUGIN_API_VERSION, type ProviderPlugin } from "@gielinor/providers";

export const examplePrices: ProviderPlugin = {
  apiVersion: PROVIDER_PLUGIN_API_VERSION,
  id: "community.example-prices",
  name: "Example public prices",
  version: "1.0.0",
  capabilities: [
    {
      capability: "current-price",
      priority: 50,
      offlineSupport: "none",
      description: "Validated public guide-price lookup",
      handler: async ({ itemId }) => ({
        itemId,
        name: "Example item",
        currentPrice: 100,
        sourceName: "Example public source",
        sourceUrl: `https://example.test/items/${itemId}`,
        retrievedAt: new Date().toISOString(),
      }),
    },
  ],
};
```

Register it only in an application composition root:

```ts
registry.register(examplePrices);
```

No core service, MCP tool, profile schema, or repository needs to change.

## Capabilities

Provider API v1 defines `player-stats`, `current-price`, `price-history`,
`price-snapshot`, `quest-snapshot`, and `training-snapshot`. Requests and
results are mapped by `ProviderCapabilityRequestMap` and
`ProviderCapabilityResultMap`.

The registry rejects an unsupported API version before it registers any
capability or health state. Within API v1, compatible additions must remain
optional. Removing a capability or changing request/result semantics requires a
new provider API major version and migration guidance.

The registry validates every successful result with the shared Zod schema.
Malformed results count as failures and fall through to the next provider.
Handlers should still validate the upstream response before normalization so
they can return precise errors.

## Priority, fallback, and disagreement

The highest integer priority runs first. Ties are deterministic by plugin ID.
Normal application calls stop after the first valid result. A failed provider
never contributes a partial result.

Audits and source comparisons can set `compareAll: true`. The registry retains
each result and reports incompatible values in `disagreements`; it never
silently merges them. Callers may provide an `equivalent` comparator when
timestamps or other non-semantic fields legitimately differ.

## Health and offline behavior

The registry tracks per-plugin, per-capability successes, failures, consecutive
failures, average latency, timestamps, and stable error codes. States are
`unknown`, `healthy`, `degraded`, or `unavailable`.

Offline routing skips capabilities marked `none`. `cache` handlers may return
retained data but must not start a network request. The built-in Hiscores and GE
providers serve retained entries even after normal stale expiry and return
`OFFLINE_CACHE_MISS` when none exists. Snapshot refreshes remain unavailable
offline; existing repository snapshots continue to work.

## Required provider tests

Start with
[`provider-contract.ts`](../../packages/providers/test/fixtures/provider-contract.ts)
and cover:

1. valid request and shared-schema result;
2. malformed and empty upstream responses;
3. timeout, network failure, rate limit, and non-retryable failure;
4. provenance and retrieval timestamp;
5. concurrent identical requests;
6. fallback below and priority above another fixture;
7. disagreement without result merging;
8. cache and offline behavior, if declared.

Run:

```sh
corepack pnpm test:providers
corepack pnpm test:hardening
```

Do not put live network calls in deterministic CI. Add them to the opt-in live
suite and classify upstream, contract, rate-limit, and local network failures.
