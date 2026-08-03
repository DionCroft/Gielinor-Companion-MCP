# One-click Windows installation

Version 1.2.0 makes the per-user NSIS installer the recommended Windows
download:

`Gielinor-Companion-Setup-1.2.0-x64.exe`

Download it and `SHA256SUMS.txt` from the official
[Version 1.2.0 release](https://github.com/DionCroft/Gielinor-Companion-MCP/releases/tag/v1.2.0),
verify the checksum, and run the installer. The installer includes the desktop
application, the exact compatible local MCP executable, and its runtime files.
It does not require Node.js, Rust, pnpm, PowerShell, or administrator elevation.

## Install and start

1. Run the setup EXE.
2. Keep the desktop shortcut selected, or clear it if you do not want one.
3. Choose **Launch Gielinor Companion** on the final page, or launch it later
   from the Start Menu.
4. Enter a public RuneScape display name and select the correct account mode.
5. Review each first-run synchronisation stage. Retry an optional failed stage
   or continue in visibly labelled limited mode.

The Start Menu entry and normal Windows Settings uninstall entry are created
for the current user. A second launch focuses the existing instance and shows a
message instead of starting another process against the same SQLite database.

## Data, upgrades, and uninstall

Installed mode stores local state under:

```text
%USERPROFILE%\.gielinor-companion\gielinor.db
```

Ordinary 1.x upgrades migrate this database forward transactionally and retain
profiles, confirmed quest state, holdings, cash, acquisition costs, journal
entries, watchlists, and paper trades. Ordinary uninstall preserves the data by
default. Remove local data only when you have deliberately backed it up and
explicitly selected the removal option.

The MSI named `Gielinor-Companion-1.2.0-x64.msi` remains available for managed
environments. The NSIS setup EXE is the normal-user recommendation.

## Updates and integrity

The in-app update checker is read-only. It shows stable release notes, identifies
the recommended platform asset, confirms whether checksum metadata is present,
and opens the official GitHub release page. Version 1.2.0 never silently
downloads or executes an update.

Release artifacts may be unsigned unless the maintainer has configured platform
certificates. Always verify `SHA256SUMS.txt` and the GitHub attestation before
running an unsigned artifact. See [release integrity](../security/release-integrity.md).

## Troubleshooting

If startup reports that the local runtime is missing or corrupt, reinstall from
the complete official installer. The application never switches to browser
preview or demo data after a native launch failure. Export a redacted report
from **Data sources** or **Diagnostics** when requesting support.
