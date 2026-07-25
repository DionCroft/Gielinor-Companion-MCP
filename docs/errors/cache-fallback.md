# Cache fallback and quarantine

Provider cache entries carry metadata version, provider provenance, fetch/store
times, fresh and stale boundaries, last successful refresh, and the most recent
failed refresh code and trace ID. Public results expose age and freshness without
revealing the internal cache key.

## Read behavior

- Fresh validated data is returned immediately.
- Data inside its stale window is returned with
  `stale-while-revalidate` while one background refresh runs.
- If a live call fails, any validated last-known-good entry may be returned even
  after its normal stale window. It is labelled `provider-failure` or
  `expired-fallback`, includes the safe refresh error, and reports a next retry
  time.
- Offline mode may use validated retained public data and labels stale data
  `offline`.
- Data marked live-only is never served offline.

Stale results are never presented as live or fresh. Player-identifying cache keys
are scoped internally and never appear in diagnostics, errors, or quarantine
lists.

## Validation and quarantine

Every cache consumer supplies the same runtime schema used for live provider
responses. Cached values and their timestamps are validated before use. Invalid
cached records move atomically to quarantine before a provider reload is
attempted.

An invalid live provider payload is quarantined as a rejected candidate and never
replaces the active valid entry. Quarantine exposes only an opaque ID, provider,
time, stable code, fixed reason, and bounded redacted sample. The full local entry
is retained only for explicit restoration or investigation; it is not exported in
diagnostics.

Restoration is an explicit maintenance action. Restored data must pass validation
again before it can be served, so restoring a still-invalid record cannot bypass
the safety boundary.
