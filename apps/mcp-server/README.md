# @gielinor/mcp-server

The stable local stdio transport for Gielinor Companion MCP.

After npm publication, run the package with Node.js 20 or later:

```sh
npx -y @gielinor/mcp-server@1
```

Or build from the repository root with `corepack pnpm build`, then start it with
`corepack pnpm start:mcp`. Client configuration is documented in the
[local MCP installation guide](../../docs/installation/local-mcp.md).

Only JSON-RPC is written to stdout. Diagnostics use stderr.
The server exposes the stable 48-tool MCP contract and performs no gameplay
input. Local profile data remains in companion-owned SQLite storage.
