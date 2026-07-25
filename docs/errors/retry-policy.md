# Retry and failure-classification policy

Gielinor Companion uses one bounded retry executor for provider, refresh, update,
and maintenance operations. The central default is three total attempts, starting
at 250 ms, doubling between attempts, capped at 30 seconds, with 20% jitter.
Callers may apply stricter provider-specific limits but cannot configure unbounded
attempts or delays.

## Classification

| Failure                        | Retry?                    | Stable code       |
| ------------------------------ | ------------------------- | ----------------- |
| Explicit cancellation          | No                        | `GC-NET-004`      |
| Timeout / HTTP 408 or 425      | Yes                       | `GC-NET-001`      |
| HTTP 429                       | Yes, honour `Retry-After` | `GC-PROVIDER-002` |
| HTTP 500–599                   | Yes                       | `GC-PROVIDER-001` |
| Network/DNS connection failure | Yes                       | `GC-NET-002`      |
| Database busy/locked           | Yes                       | `GC-DB-002`       |
| Other HTTP 400–499             | No                        | `GC-DATA-001`     |
| Schema or argument validation  | No                        | `GC-DATA-001`     |
| Unknown failure                | No until classified       | `GC-UNKNOWN-999`  |

`Retry-After` accepts seconds or an HTTP date. It is capped by the caller's
maximum delay and receives upward-only jitter so the companion never retries
earlier than the provider requested.

Each attempt emits bounded telemetry: attempt number, maximum attempts, outcome,
duration, failure class, stable code, and next delay. It never includes complete
URLs, request bodies, response bodies, headers, credentials, player names, profile
IDs, email addresses, or stack traces. Telemetry failures never change the
operation result.

Cancellation is checked before every attempt and during the default backoff wait.
The final classified error is returned after the maximum attempt count; the system
does not hide exhaustion behind a new unrelated exception.
