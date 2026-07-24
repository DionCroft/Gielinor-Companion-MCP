# Hardening, failure, and load testing

Run the deterministic Version 1 stable suite:

```sh
corepack pnpm test:hardening
corepack pnpm test:load
corepack pnpm profile:performance
```

Coverage includes provider priority/fallback/disagreement/health, invalid
results, cache-only offline behavior, concurrent HTTP/cache deduplication,
injected network failure, schema/profile/data migrations, migration rollback,
database locks, 2,000-profile memory/time bounds, a 1,000-node quest chain, and
250 hosted liveness requests at concurrency 25.

To load a separately started hosted service:

```sh
GIELINOR_LOAD_URL=http://127.0.0.1:3333 \
GIELINOR_LOAD_REQUESTS=1000 \
GIELINOR_LOAD_CONCURRENCY=25 \
corepack pnpm load:hosted
```

The script reports total duration and p50/p95/p99 latency and fails on any
non-successful response. Do not point it at a service without the operator's
permission.
