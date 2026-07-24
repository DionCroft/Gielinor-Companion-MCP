# Claude Code installation

Build the [local MCP server](local-mcp.md), then register it:

```sh
claude mcp add --transport stdio gielinor-companion -- node /absolute/path/to/Gielinor-Companion-MCP/apps/mcp-server/dist/index.js
claude mcp get gielinor-companion
claude mcp list
```

The `--` separator ends Claude Code options and begins the server command. Keep
the database and User-Agent in user-scoped environment configuration, not a
committed project file. Claude Code asks before trusting project-scoped MCP
configuration.

For anonymous hosted tools:

```sh
claude mcp add --transport http gielinor https://mcp.example.com/mcp
```

For one private hosted profile:

```sh
claude mcp add --transport http \
  --header "Authorization: Bearer your-gielinor-token" \
  gielinor-private https://mcp.example.com/mcp
```

Keep the token out of shell history where possible and never paste it into a
conversation. It is a companion token, not a Jagex credential. Use `claude mcp
get gielinor-private` and Claude Code's `/mcp` view to verify the connection.
Refer to Anthropic's current
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp) if CLI syntax
changes.
