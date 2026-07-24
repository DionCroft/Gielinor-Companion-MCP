# Claude Code setup

Build the repository, then register the stdio process:

```sh
claude mcp add --transport stdio gielinor-companion -- node /absolute/path/to/Gielinor-Companion-MCP/apps/mcp-server/dist/index.js
```

Use `claude mcp list` to confirm discovery. Set `GIELINOR_DB_PATH` and
`GIELINOR_USER_AGENT` in the MCP environment using the current Claude Code
configuration mechanism if you do not want the defaults.

The executable path must be absolute because Claude Code may launch the process
from another working directory.

## Remote Streamable HTTP

Use the deployed public tool surface:

```sh
claude mcp add --transport http gielinor https://mcp.example.com/mcp
```

For an authenticated private profile, keep the token out of project files:

```sh
claude mcp add --transport http \
  --header "Authorization: Bearer your-gielinor-token" \
  gielinor-private https://mcp.example.com/mcp
```

Run `claude mcp get gielinor-private` and `/mcp` to verify the connection. The
current syntax and safer environment-variable configuration options are in the
[official Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

See [the complete project guide](../../docs/installation/claude-code.md).
