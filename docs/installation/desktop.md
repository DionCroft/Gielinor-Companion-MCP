# Desktop installation and source builds

Version 1.2 is a local-first Tauri application with a complete no-AI mode and
optional loopback-only Ollama or LM Studio support. It accepts only public
RuneScape display names and optional planning preferences. It never needs game
credentials or a model-provider API key.

Normal Windows users should use the
[one-click installer](one-click-windows.md). The optional isolated archive is
documented in [portable Windows mode](portable-windows.md). The source build
below is for contributors.

## Windows source build

Install Node.js 22 or 24 LTS, Corepack, Rust 1.85+, and the Microsoft C++ build tools,
then run:

```powershell
corepack pnpm install
corepack pnpm build
corepack pnpm desktop:dev
```

Create unsigned NSIS and MSI installers:

```powershell
corepack pnpm --filter @gielinor/desktop prepare:runtime
corepack pnpm --filter @gielinor/desktop exec tauri build --bundles nsis,msi
```

Installers are written below
`apps/desktop/src-tauri/target/release/bundle/nsis/` and `bundle/msi/`.

## macOS and Linux

Install the platform prerequisites from the Tauri 2 documentation, then use the
same install/build commands. The tag-driven `Stable release` workflow builds
DMG, AppImage, and Debian bundles in addition to Windows NSIS/MSI.

Locally built native bundles are unsigned unless you configure a platform
certificate. The stable release workflow accepts maintainer-owned Apple signing
inputs; macOS public distribution additionally requires notarization. Trusted
Windows distribution requires an Authenticode certificate.

## Installing a release artifact

Download the installer for your operating system and `SHA256SUMS.txt` from the
same GitHub release. Verify the hash before running it. Windows users can choose
NSIS (`-setup.exe`) or MSI; macOS uses DMG; Linux provides AppImage and DEB.
Unsigned artifacts are labelled as such when maintainer certificates are not
configured. See [release integrity](../security/release-integrity.md).

Version 1.2 does not silently download or apply updates. The checker identifies
the recommended platform asset, shows checksum-metadata availability, and opens
the trusted release page; the user explicitly verifies and installs it.

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

Local model setup is documented separately in the
[Ollama and LM Studio guide](local-ai.md). Model traffic uses Tauri's native HTTP
client and an allow-scope restricted to `localhost`, `127.0.0.1`, and `::1`.

## Verification

```sh
corepack pnpm test:desktop
corepack pnpm test:desktop:e2e
corepack pnpm test:desktop:rust
```

The first suite covers React state, forms, and local-AI flows; the second covers
eleven user journeys in Chromium; and the third verifies the native allowlist
and loopback network scope plus a real MCP stdio command.
