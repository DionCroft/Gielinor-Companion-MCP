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

`MCP_TOOL_NAMES_V0_9` is an executable compatibility snapshot. Update it only
when the intentional tool change, documentation, and migration notes are in the
same pull request.

## Error and safety rules

- Validate before calling core logic and validate provider data at its boundary.
- Return public `CompanionError` codes; never return stack traces or local paths.
- Never accept arbitrary output paths, credentials, cookies, or gameplay input.
- Profile mutations affect companion storage only.
- GE results are guide data, never guaranteed trade outcomes.

Run `corepack pnpm test:mcp`, `test:integration`, and `test:e2e` before review.
