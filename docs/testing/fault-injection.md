# Fault-injection testing

Version 1.1 uses deterministic dependency injection and temporary SQLite files;
standard CI does not require a live network. Run:

```sh
corepack pnpm test:fault-injection
```

| Injected failure            | Deterministic coverage                            | Expected safety result                            |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Timeout / slow provider     | `packages/providers/test/http.test.ts`            | `GC-NET-001`; bounded attempts                    |
| DNS failure                 | `packages/providers/test/http.test.ts`            | `GC-NET-002`; redacted public message             |
| HTTP 429                    | `packages/providers/test/http.test.ts`            | `Retry-After`; `GC-PROVIDER-002`                  |
| HTTP 500                    | `packages/providers/test/http.test.ts`            | bounded retry; `GC-PROVIDER-001`                  |
| Empty or incomplete payload | `packages/providers/test/jagex-providers.test.ts` | rejected before storage                           |
| Malformed payload           | provider parser and cache tests                   | quarantined; valid cache retained                 |
| Corrupt cache               | provider and database cache tests                 | active read blocked; redacted quarantine          |
| Database lock               | `packages/database/test/recovery.test.ts`         | original preserved; safe mode                     |
| Failed migration            | database recovery and data-migration tests        | verified rollback; no row loss                    |
| Interrupted migration/sync  | recovery and scheduler tests                      | marker/lease recovery; bounded backoff            |
| Scheduler crash             | `packages/database/test/scheduler.test.ts`        | expired lease marked interrupted                  |
| Recovery storm              | scheduler limit test                              | permanent `failed` / `GC-SCHED-004`; manual retry |
| Update-service outage       | `apps/mcp-server/test/update-service.test.ts`     | cached metadata or safe unable state              |

Fixture assertions also verify cancellation, retry jitter and elapsed-time
limits, half-open provider probes, provider isolation, live-only cache rejection,
cross-scope cache keys, backup verification, failed restore, offline scheduling,
and partial catalogue success.

The scheduled live monitor is separate because upstream availability is
nondeterministic. It classifies transient outages without failing deterministic
pull-request CI; see [live provider monitoring](live-provider-monitoring.md).
