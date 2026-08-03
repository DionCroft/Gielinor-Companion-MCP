# Privacy policy

Gielinor Companion is local-first. The standard MCP server and desktop
application do not operate a developer analytics service, do not require an
account, and do not collect telemetry.

## Data handled locally

- A RuneScape display name and public Hiscores snapshot.
- Manually selected account mode, quest state, planning preferences, and goals.
- Versioned local holdings/cash snapshots, optional acquisition prices, GE
  trade journal, watchlists, selected profile, and hypothetical paper trades.
- Validated public quest, training, and Grand Exchange cache records.
- Redacted error codes, provider health, scheduler attempts, recovery events,
  and bounded invalid-cache quarantine metadata.
- Optional ad-hoc dashboard goals and shopping lists in installation-local UI
  storage.

The default SQLite path is
`~/.gielinor-companion/gielinor.db`. Delete that file and the adjacent
`-shm`/`-wal` files while the application is closed to remove local MCP data.
The desktop does not silently upload that database.

Explicit Windows portable mode instead stores data below `portable-data` beside
the extracted application. It never silently mixes that database with the
installed per-user database. Ordinary installer upgrades and uninstall preserve
the per-user database by default.

## Data never requested

Do not enter a Jagex email, password, authenticator code, launcher/session token,
bank PIN, payment information, or CAPTCHA response. The application has no
legitimate use for those values.

## Public providers

Explicit refreshes send only the minimum public lookup to Jagex or the RuneScape
Wiki. A player-stat refresh sends the public display name to the selected
Hiscores endpoint. Requests include the configured application User-Agent.
Provider responses are validated, source-stamped, cached, and never treated as
game credentials.

User-facing data is classified as live public, validated cache, manual local,
imported local, Alt1-confirmed, deterministic derived, preview fixture, or
unavailable. A value is labelled Live only when a real provider succeeds during
that request. The redacted provenance report excludes display names, profile
identifiers, holdings, trades, credentials, provider payloads, and local paths.

Automatic maintenance sends the same minimal public requests as a manual
refresh and respects offline mode. The update checker may request public release
metadata from GitHub at most once every 24 hours by default. It sends no player
profile or local diagnostic data.

## Local AI

Optional Ollama and LM Studio requests are restricted to loopback endpoints.
The selected model receives the current conversation, shared tool declarations,
and validated tool results required for that turn. Conversations stay in memory
and clear on reset, provider/profile changes, or application exit. No cloud
model endpoint or API key is supported by this local-only adapter.

## Optional Alt1 overlay

The separately installed overlay is disabled by default. After consent and a
second Connect action it may inspect visible main-chat pixels locally. Raw
pixels and OCR lines are transient, outgoing connections are blocked, and
probable completion text requires manual confirmation. See
[overlay privacy and consent](docs/security/overlay-privacy.md).

## Optional hosted service

An operator-hosted deployment is a separate data controller. Authenticated
profiles use random Gielinor-specific bearer tokens and isolated SQLite files;
only token digests are stored. Operators must publish their retention, backup,
deletion, legal-jurisdiction, and contact terms. See
[hosted privacy and account lifecycle](docs/security/hosted-privacy.md).

## Exports and logs

Profile and holdings exports contain public and manually entered companion
data. Treat them as personal data if a display name or trading history identifies
you. Standard logs redact tokens,
tool arguments, display names, provider bodies, profile content, local paths,
and stack traces.

The diagnostic export deliberately excludes profiles, databases, raw provider
payloads, private identifiers, authentication headers, prompts, absolute paths,
and stack traces.

Privacy or security concerns should follow [SECURITY.md](SECURITY.md).
