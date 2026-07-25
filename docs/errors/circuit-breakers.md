# Provider circuit breakers and fallback

Each provider capability has an independent circuit breaker. A failure in player
Hiscores does not disable Grand Exchange, quest, training, local AI, hosted, or
update services, and a failing extension provider does not open the built-in
provider's circuit.

## States

- `closed`: requests run normally. A success resets consecutive breaker failures.
- `open`: calls skip the provider and immediately try the next healthy fallback.
  Diagnostics show the failure count, last failure, current cooldown, and next
  safe probe time.
- `half-open`: after cooldown, exactly one request probes the provider. Concurrent
  requests continue to a fallback. A successful probe closes the circuit; a failed
  probe reopens it with a longer bounded cooldown.

The default circuit opens after three breaker-relevant failures, waits 30 seconds,
and may extend repeated failed-probe cooldowns up to five minutes. Malformed
provider data, contract changes, transient HTTP failures, timeouts, and unknown
provider exceptions affect the circuit. User input errors and normal not-found
responses do not.

Fallback attempts remain ordered by provider priority. Every route result records
whether a provider succeeded, failed, or was skipped because its circuit was open.
The record contains no request body, raw response, player identifier, complete URL,
credential, or stack.

Circuit reset is explicit and scoped. The diagnostics maintenance surface can reset
one provider capability or all breakers, but normal reads never bypass an open
circuit, even when a force-refresh was requested.
