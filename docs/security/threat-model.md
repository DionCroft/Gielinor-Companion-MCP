# Threat model

Date reviewed: 2026-07-24

## Assets

- local profiles, goals, quest status, and cached public data;
- hosted account tokens and per-account databases;
- operator configuration;
- application integrity and provider provenance;
- user control over all RuneScape gameplay.

RuneScape credentials are not assets because the project never requests or
stores them.

## Trust boundaries and threats

### Public providers

Threats: malformed data, schema drift, outage, throttling, oversized responses,
and conflicting sources.

Controls: HTTPS URLs, bounded timeouts/retries, runtime schemas, normalization,
provenance, transactional snapshots, cache retention, explicit priority,
fallback diagnostics, disagreement preservation, and health tracking.

### Local MCP and model clients

Threats: malformed tool calls, fabricated model success, path disclosure, and
unbounded loops.

Controls: shared schemas, deterministic services, bounded local-agent loops,
stable public errors, no arbitrary filesystem tools, and no gameplay-input
tools.

### Hosted HTTP

Threats: token theft, cross-account access, request floods, oversized bodies,
host/origin confusion, plaintext transport, deletion races, and log leakage.

Controls: hashed bearer tokens, constant-time comparison, isolated UUID-named
databases, authorization filtering, host/origin allowlists, HTTPS enforcement,
request/tool limits, size/time bounds, deletion locks, security headers, and
structured redacted logs.

### Desktop and local storage

Threats: malicious profile imports, migration corruption, database locking,
remote local-AI endpoints, and stale data misrepresented as fresh.

Controls: strict versioned imports, transactional migrations and backups,
bounded SQLite busy timeout, loopback endpoint validation, explicit freshness,
and cache-only offline mode.

### Optional overlay

Threats: inadvertent capture of chat, policy drift, generated gameplay input,
and screen data exfiltration.

Controls: disabled by default, separate consent/connect, field selection,
redaction, private/player-chat rejection, network-denying CSP, manual
confirmation, permission checks, and no input/memory/packet APIs.

## Out of scope

A fully compromised operating system, malicious replacement installer, and
stolen hosted token outside this service boundary remain out of scope. Release
checksums and signing support reduce distribution risk in Version 1.0.
