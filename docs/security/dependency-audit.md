# Dependency audit

Audit date: 2026-07-24

## Node

`corepack pnpm audit --audit-level moderate` initially found a moderate
`@hono/node-server` path-handling advisory through MCP SDK 1.29.0. The MCP SDK
still declares the 1.x adapter range, so the root lockfile now overrides that
transitive adapter to 2.0.11. All hosted MCP protocol tests pass with the
override.

The repeated audit reports **no known vulnerabilities** across the locked Node
dependency graph. CI runs the high/critical gate on every pull request.

## Rust

The local environment did not have `cargo-audit` installed. CI uses the
official `rustsec/audit-check@v2.0.0` action against
`apps/desktop/src-tauri/Cargo.lock`; an advisory fails the security job. The
normal native job also runs formatting, Clippy with warnings denied, tests, and
the no-bundle application build.

Dependabot continues to open separate npm, Cargo, and GitHub Actions updates.
Major dependency changes require focused compatibility tests and are not
silently adopted by audit remediation.

Primary references:

- [npm audit command](https://pnpm.io/cli/audit)
- [RustSec cargo-audit](https://github.com/rustsec/rustsec/tree/main/cargo-audit)
- [RustSec audit-check](https://github.com/rustsec/audit-check)
