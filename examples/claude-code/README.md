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
