# Installer acceptance

The tag workflow builds native bundles on clean GitHub-hosted Windows, macOS,
and Ubuntu runners. Windows additionally performs a silent per-user NSIS
install/uninstall smoke test before publishing the artifact.

## Automated Windows assertions

The clean-runner smoke test verifies:

- one per-user uninstall registration with dynamic DisplayVersion `1.2.0`;
- installed desktop executable, MCP sidecar, and runtime entry;
- Start Menu shortcut and default desktop shortcut;
- an existing local-database sentinel is byte-for-byte unchanged by install;
- silent ordinary uninstall removes the program but preserves that database.

Static release gates also verify the current-user NSIS mode, Start Menu folder,
bundled runtime declarations, single-instance plugin order, visible
second-instance notification, portable isolation, developer launcher checks,
stable asset names, checksums, SBOM, and attestation workflow.

## Local Windows evidence

On 2026-08-03, a clean installation location on Windows x64 was exercised with
the actual 1.2.0 NSIS artifact. It installed without elevation, registered
Version 1.2.0, created both shortcut types, included the sidecar/runtime, and
preserved an existing `%USERPROFILE%\.gielinor-companion\gielinor.db` hash
through install and uninstall.

The locally generated MSI compiled, but normal WiX ICE validation could not run
because Windows Installer Service was unavailable in that development session.
It is not counted as locally validated; the clean Windows release runner must
produce and validate the normal MSI build before publication.

## Commands

```powershell
corepack pnpm test:launcher
corepack pnpm test:installer
corepack pnpm test:portable
corepack pnpm test:release-assets
corepack pnpm --filter @gielinor/desktop prepare:runtime
corepack pnpm --filter @gielinor/desktop exec tauri build --bundles nsis,msi
corepack pnpm pack:portable
./scripts/smoke-windows-installer.ps1
```

Never run the smoke script over an existing Gielinor installation; it refuses
when it finds one. It preserves, rather than deletes, any local database.
