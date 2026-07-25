# Self-healing policy

Gielinor Companion recovers automatically only when the action is bounded,
observable, reversible, and cannot weaken a consent or security boundary.

## Recovery modes

- `bounded-retry`: exponential backoff with jitter, retry caps, and cancellation.
- `fallback`: use the next healthy provider or labelled last-known-good data.
- `rollback`: abandon an incomplete transaction or migration and preserve the
  previous valid state.
- `safe-mode`: open read-only diagnostics while write-dependent features remain
  disabled.
- `manual`: stop safely and show explicit recovery steps.
- `none`: report the condition without performing a mutation.

Every attempt records a stable code, trace ID, source, operation, timestamp, and
sanitised outcome. Repeated failures eventually stop; recovery never loops
indefinitely.

## Non-negotiable safeguards

- No automatic account, profile, or database deletion.
- No silent migration after a failed integrity check.
- No replacement of valid cached data with malformed upstream data.
- No secret, credential, personal identifier, raw payload, stack, or absolute path
  in public errors or exported diagnostics.
- No automatic application update or installer execution.
- No weakening of hosted tenant isolation, MCP tool permissions, or local-AI
  consent controls.
