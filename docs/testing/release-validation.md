# Version 1.2 release validation

Run the normal quality gates and the focused Version 1.2 gates:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:mcp
corepack pnpm test:providers
corepack pnpm test:database
corepack pnpm test:desktop
corepack pnpm test:desktop:e2e
corepack pnpm test:desktop:rust
corepack pnpm test:integration
corepack pnpm test:market-intelligence
corepack pnpm test:portfolio
corepack pnpm test:backtesting
corepack pnpm test:real-data-boundaries
corepack pnpm test:no-demo-native
corepack pnpm test:safety
corepack pnpm test:launcher
corepack pnpm test:installer
corepack pnpm test:portable
corepack pnpm test:release-assets
corepack pnpm test:provenance
corepack pnpm test:live-data-ui
corepack pnpm test:release
corepack pnpm build
```

`test:release` preserves the original 48-tool Version 1.0 order/schemas and the
93-tool additive Version 1.1 contract, profile export v1, provider API v1, and
database schema 8. Upgrade-path tests migrate old fixture databases through
every migration without losing profile-private state. `smoke:clean-install`
packs all public workspaces, installs them into a temporary project, and starts
the packed MCP CLI offline.

The normal CI builds the native application on clean Windows, macOS, and Linux
runners. The tag workflow additionally builds NSIS/MSI, DMG, AppImage/DEB,
portable ZIP, npm archives, SPDX SBOM, checksums, attestations, and the hosted
GHCR image. Windows performs a clean per-user install/uninstall smoke test before
its bundles can become release assets.

Platform signing and notarization require maintainer-owned credentials and are
never emulated. Live Jagex, Wiki, Grand Exchange, news, and GitHub checks run
separately on a conservative schedule so an upstream outage cannot be reported
as a deterministic code regression.

See [installer acceptance](installer-acceptance.md),
[live-data audit](live-data-audit.md), and the
[Version 1.2 completion record](../releases/v1.2.0-completion.md).
