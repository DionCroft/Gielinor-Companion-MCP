# Security audit checklist

Reviewed for Version 1.0 on 2026-07-24.

- [x] No gameplay input, credential, client-memory, packet, or trade automation.
- [x] External responses use timeouts, success checks, runtime validation,
      provenance, and safe errors.
- [x] Snapshot writes and schema migrations are transactional.
- [x] Profile/data migrations preserve original input on failure.
- [x] Hosted authentication, authorization, cross-user isolation, deletion,
      limits, HTTPS, host/origin checks, and redacted logs are tested.
- [x] Offline mode makes no provider request and marks retained expired data
      stale.
- [x] Provider conflicts are retained rather than silently merged.
- [x] Concurrent HTTP/cache refreshes are coalesced and locks release on error.
- [x] Database-lock failures are actionable and later writes recover.
- [x] Overlay CSP denies network and the adapter has no input capability.
- [x] Repository scan excludes tokens, private keys, personal profiles, local
      databases, build output, and personal paths.
- [x] Node production dependencies have no known advisory after the explicit
      Hono 2.0.11 override.
- [x] RustSec audit is enforced in CI against the Tauri lockfile.
- [x] Release automation produces checksums, SPDX JSON SBOMs, and GitHub
      artifact attestations.
- [x] Desktop signing/notarization inputs are supported without embedding
      credentials; unsigned artifacts are identified when certificates are not
      configured.
- [x] Stable MCP, profile, provider, and database contracts have executable
      compatibility/upgrade tests.

Any unchecked item blocks the corresponding release claim. Maintainer
certificate availability does not block a clearly labelled unsigned artifact.
