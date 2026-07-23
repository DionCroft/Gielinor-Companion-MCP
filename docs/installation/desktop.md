# Desktop installation and source builds

Version 0.5 is a local, no-AI Tauri application. It accepts only public
RuneScape display names and optional planning preferences. It never needs game
credentials.

## Windows source build

Install Node.js 20+, Corepack, Rust 1.85+, and the Microsoft C++ build tools,
then run:

```powershell
corepack pnpm install
corepack pnpm build
corepack pnpm desktop:dev
```

Create an unsigned NSIS installer:

```powershell
corepack pnpm --filter @gielinor/desktop prepare:runtime
corepack pnpm --filter @gielinor/desktop exec tauri build --bundles nsis
```

The installer is written below
`apps/desktop/src-tauri/target/release/bundle/nsis/`.

## macOS and Linux

Install the platform prerequisites from the Tauri 2 documentation, then use the
same install/build commands. The manual `Desktop release` workflow verifies DMG,
AppImage, and Debian bundle paths in addition to Windows NSIS.

Native bundles are unsigned development artifacts. macOS distribution therefore
requires your own Apple signing and notarization configuration; trusted Windows
distribution requires an Authenticode certificate.

## Local data and offline use

Profiles and validated provider data use:

```text
~/.gielinor-companion/gielinor.db
```

The Settings view can switch to retained-data mode. Explicit refresh actions are
disabled, cached deterministic views remain available, and stale/error states
stay visible. This setting is not a network firewall.

Portable profile export contains public/manual companion data only. It excludes
credentials and assigns new local identifiers when imported.

## Verification

```sh
corepack pnpm test:desktop
corepack pnpm test:desktop:e2e
corepack pnpm test:desktop:rust
```

The first suite covers React state and forms, the second covers eight user
journeys in Chromium, and the third verifies the native allowlist plus a real
MCP stdio command.
