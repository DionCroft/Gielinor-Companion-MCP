# Read-only software update checker

Version 1.1 reads published metadata from the official GitHub Releases API.
GitHub documents that the latest-release endpoint excludes drafts and
pre-releases, while the list endpoint exposes published releases and their
assets. Gielinor Companion uses the documented list endpoint so an explicit
pre-release preference can be honoured:

`GET https://api.github.com/repos/DionCroft/Gielinor-Companion-MCP/releases?per_page=20`

See the [official GitHub Releases REST API
documentation](https://docs.github.com/en/rest/releases/releases).

## Validation and selection

Responses are bounded and schema-validated before use. Drafts and unpublished
records are ignored. Release tags must be semantic versions. Stable releases
are selected by default; pre-releases participate only after an explicit
opt-in. Release and asset links must be HTTPS URLs beneath the official
`DionCroft/Gielinor-Companion-MCP` GitHub release path.

Results include installed and available versions, status, release notes,
publication date, platform assets, API-provided SHA-256 digests, a timestamp,
and a trace ID. `GC-UPDATE-004` marks an asset without a published digest.

The checker never downloads, installs, executes, or silently stages an asset.

## Cache and failure behaviour

Validated metadata is cached for 24 hours by default. A normal check uses the
fresh cache and contacts GitHub at most once per interval. Manual checks may
force a read. During temporary network or rate-limit failures, the last
validated cached metadata remains visible with `GC-UPDATE-001` or
`GC-UPDATE-005`.

Invalid live metadata returns `GC-UPDATE-003` and is never cached. Invalid
cached metadata is quarantined. Offline mode never contacts GitHub. Checks can
be disabled with:

```text
GIELINOR_UPDATE_CHECKS_ENABLED=false
```

The scheduler interval is:

```text
GIELINOR_UPDATE_CHECK_MS=86400000
```

The scheduled job uses the same validated read-only path and persists attempt,
backoff, and recovery status like other maintenance work.
