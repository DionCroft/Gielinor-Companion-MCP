# Release integrity and signing

The tag-driven release workflow builds each release from a clean GitHub-hosted
runner after the mandatory gates pass.

## Published evidence

- SHA-256 entries for every attached artifact in `SHA256SUMS.txt`.
- SPDX JSON software bill of materials generated with Anchore Syft.
- GitHub artifact provenance attestations for release files.
- A registry attestation for the GHCR hosted image.
- npm tarballs whose manifests declare public access and provenance.

Verify checksums:

```sh
sha256sum --check SHA256SUMS.txt
```

PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\artifact-name
```

Compare the displayed hash with `SHA256SUMS.txt`. GitHub CLI can verify release
assets and attestations where supported:

```sh
gh release verify v1.2.0
gh release verify-asset v1.2.0 ./artifact-name
gh attestation verify ./artifact-name --repo DionCroft/Gielinor-Companion-MCP
```

See GitHub's
[release-integrity](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)
and
[artifact-attestation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations)
guides.

## Platform signing

No signing key or certificate is stored in the repository.

- macOS release jobs accept `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, and `APPLE_SIGNING_IDENTITY` secrets supported
  by Tauri. Public distribution also requires Apple notarization credentials.
- Windows release jobs are reproducible without a certificate. Trusted
  Authenticode distribution requires a maintainer certificate, an imported PFX,
  and the corresponding Tauri `certificateThumbprint`/timestamp configuration.
- Linux AppImage signing can be added with a release GPG key, but the detached
  checksum and GitHub attestation remain the default verification path.

If those maintainer-controlled credentials are absent, artifacts are explicitly
described as unsigned. A workflow must never substitute a generated throwaway
certificate or expose key material. Refer to Tauri's official
[distribution and signing guides](https://v2.tauri.app/distribute/).

## Updates

Version 1.2 does not install updates in the background. Users deliberately
download a release, verify it, close the app, and run the chosen installer.
This avoids creating an unsigned update channel. Adding an automatic updater
later requires a durable Tauri updater key, public-key pinning, rollback tests,
and a documented recovery procedure.
