## What changed

Describe the user-visible outcome and the affected package or application.

## Safety and compatibility

- [ ] No credentials, personal profiles, tokens, databases, logs, or build output.
- [ ] No gameplay input, automation, memory reading, packet interception, or trade execution.
- [ ] Existing MCP/profile/database contracts are preserved or have a documented migration.
- [ ] External data remains validated, timestamped, sourced, and transactionally retained.

## Verification

- [ ] `corepack pnpm format:check`
- [ ] `corepack pnpm lint`
- [ ] `corepack pnpm typecheck`
- [ ] `corepack pnpm test`
- [ ] Relevant integration, provider, database, desktop, hosted, or hardening tests
- [ ] Documentation and known limitations updated
