# Troubleshooting structured errors

Start with the stable `GC-...` code and `traceId` shown by the client. Look up the
code in the [error-code reference](error-codes.md), then inspect Diagnostics for
the affected provider, cache, database, or maintenance job.

## Safe investigation order

1. Record the code, trace ID, timestamp, source, and operation.
2. Check whether the error is retryable and whether `retryAfterMs` is present.
3. Let automatic recovery finish before using **Run now** or restarting.
4. Confirm whether a last-known-good cache or safe mode is active.
5. Export redacted diagnostics if the same code repeats.

Do not paste access tokens, API keys, player names, profile IDs, email addresses,
absolute file paths, database files, raw upstream payloads, or stack traces into
an issue. A structured export is designed to omit these values.

## Recovery boundaries

- Retryable does not mean retry forever. The companion uses bounded exponential
  backoff with jitter.
- A circuit breaker may reject a request temporarily while an upstream service
  recovers.
- Stale data is explicitly labelled with its age and source.
- Database recovery preserves the original file and enters safe mode instead of
  silently replacing user data.
- Update checks are advisory. Gielinor Companion never silently installs a release.

If `GC-UNKNOWN-999` repeats, attach a redacted diagnostics export and the trace ID
to a GitHub issue. That code means the failure needs a more specific classification.
