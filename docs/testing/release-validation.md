# Version 1.1 release validation

Run the release-specific checks after the normal gates:

```sh
corepack pnpm verify:contracts
corepack pnpm verify:docs
corepack pnpm test:release
corepack pnpm smoke:clean-install
corepack pnpm pack:release
```

`test:release` freezes the original 48-tool Version 1.0 order and schemas,
validates the additive 60-tool Version 1.1 contract, profile export v1, provider
API v1, and database schema v6. It upgrades a Version 1 database through every
migration without losing a profile. `smoke:clean-install` packs all public
workspace packages, installs them in a temporary project, starts the packed MCP
CLI offline, and verifies the 60-tool surface retains the exact Version 1.0
prefix.

The normal CI builds the Tauri native application on Windows, macOS, and Linux.
The tag workflow additionally bundles NSIS/MSI, DMG, AppImage/DEB, npm archives,
an SPDX SBOM, checksums, attestations, and the hosted GHCR image.

Platform signing and notarization require maintainer-owned credentials and are
never emulated in deterministic CI. Live Jagex, Wiki, Grand Exchange, and update
metadata checks run separately from deterministic pull-request CI so upstream
outages cannot be misreported as application regressions.

The final completion record in
[Version 1.1 completion](../releases/v1.1.0-completion.md) records the exact
local and GitHub results used for the release branch.
