# Contributing

Thank you for helping build a safe RuneScape companion.

## Set up

1. Install Node.js 20 or later.
2. Run `corepack enable`.
3. Run `corepack pnpm install`.
4. Run `corepack pnpm build`.

Before opening a pull request, run:

```sh
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

Live API tests are optional and must not be the only coverage for a provider.
Use small synthetic fixtures for CI.

## Design rules

- Put game calculations and recommendations in `packages/core`.
- Define external dependencies as core ports; isolate their parsing in providers.
- Validate every external payload before returning a domain object.
- Preserve the previous valid cache record after a failed refresh.
- Keep MCP and UI layers thin and model-independent.
- Attach source provenance and timestamps to externally derived results.
- Do not copy substantial Wiki prose; store structured facts and links.
- Never add gameplay input, credentials, client memory access, packet interception,
  trade execution, or anti-cheat bypass behavior.

## Changes

Keep changes focused, add tests, update affected documentation, and add a changelog
entry when behavior changes. Do not mark roadmap work complete while checks fail.
Use conventional, imperative commit subjects where practical.

## Security

Do not disclose vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).
