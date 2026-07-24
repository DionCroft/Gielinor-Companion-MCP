# MCP tool development guide

The MCP surface is generated from shared contracts and delegates to
deterministic services. A tool must never contain provider parsing, database
SQL, or model-authored calculations.

## Change path

1. Add or reuse a strict Zod input schema in
   `packages/shared-types/src/tool-schemas.ts`.
2. Add metadata to `COMPANION_TOOL_DEFINITIONS`; classify the effect as
   `read-only` or `local-state`.
3. Add the deterministic operation to the relevant core service.
4. Expose it through `CompanionToolService`.
5. Register it in `createCompanionServer` with correct MCP annotations.
6. Add input, output, failure, and protocol tests.
7. Document purpose, schemas, examples, source, caching, errors, and privacy in
   the MCP reference.

## Compatibility

Never rename or remove a published tool in place. Add optional fields where
possible. Required fields, enum removals, output shape changes, or semantic
changes need a new contract version and migration/deprecation plan.

`MCP_TOOL_NAMES_V1` is the stable executable compatibility snapshot.
`MCP_TOOL_NAMES_V0_9` remains a deprecated alias for prerelease consumers. A
breaking surface change needs a new contract major version; do not mutate the
v1 snapshot in place.

Regenerate and verify the public machine-readable contract after a compatible
schema change:

```sh
corepack pnpm generate:contracts
corepack pnpm verify:contracts
```

Commit `data/contracts/mcp-tools-v1.json` with the source change.

## Error and safety rules

- Validate before calling core logic and validate provider data at its boundary.
- Return public `CompanionError` codes; never return stack traces or local paths.
- Never accept arbitrary output paths, credentials, cookies, or gameplay input.
- Profile mutations affect companion storage only.
- GE results are guide data, never guaranteed trade outcomes.

Run `corepack pnpm test:mcp`, `test:integration`, `test:e2e`, and
`test:release` before review.
