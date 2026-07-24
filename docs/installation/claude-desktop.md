# Claude Desktop installation

Build the [local MCP server](local-mcp.md), then open Claude Desktop's local MCP
configuration from its developer/settings UI and merge this entry:

```json
{
  "mcpServers": {
    "gielinor-companion": {
      "command": "node",
      "args": ["/absolute/path/to/Gielinor-Companion-MCP/apps/mcp-server/dist/index.js"],
      "env": {
        "GIELINOR_DB_PATH": "/absolute/private/path/gielinor.db",
        "GIELINOR_USER_AGENT": "Gielinor-Companion-MCP/1.0.0 (contact: you@example.com)"
      }
    }
  }
}
```

Use Windows backslashes only when they are JSON-escaped (`C:\\path\\file`) or use
forward slashes. Fully restart Claude Desktop after saving. Ask Claude to list
the Gielinor tools, then test a deterministic call such as:

```text
Using Gielinor Companion, calculate the XP remaining from 1,000,000 XP to level 99.
```

Anthropic now recommends Desktop Extensions for one-click local-server
distribution. Version 1.0 remains a transparent developer-defined stdio server;
it does not claim to be an Anthropic-reviewed extension. Review the source and
permissions before enabling any local MCP server. Anthropic's current
[local MCP guidance](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
explains the extension and organization-control options.

For a hosted endpoint, add it through Claude's **Settings → Connectors** rather
than placing a remote URL in `claude_desktop_config.json`. The hosted public
surface is authless; private fixed-bearer profiles are best used with Claude
Code. See [hosted MCP](hosted.md).
