# LM Studio installation

LM Studio can use Gielinor Companion in two separate ways.

## LM Studio as an MCP host

LM Studio 0.3.17 or later can launch local stdio MCP servers. Build the
[local server](local-mcp.md), open **Program → Install → Edit mcp.json**, and
merge:

```json
{
  "mcpServers": {
    "gielinor-companion": {
      "command": "node",
      "args": ["/absolute/path/to/Gielinor-Companion-MCP/apps/mcp-server/dist/index.js"],
      "env": {
        "GIELINOR_DB_PATH": "/absolute/private/path/gielinor.db",
        "GIELINOR_USER_AGENT": "Gielinor-Companion-MCP/1.2.0 (contact: you@example.com)"
      }
    }
  }
}
```

Choose a model that reliably supports tools. LM Studio warns that MCP servers
can execute local code; review this repository and keep the command path exact.
The current [LM Studio MCP guide](https://lmstudio.ai/docs/app/mcp) also
documents remote `url` entries and custom headers.

## LM Studio as the desktop's local model

1. Download a tool-capable chat model.
2. Start the Local Server in **Developer**, normally on
   `http://127.0.0.1:1234`.
3. Open **AI providers** in Gielinor Companion.
4. Select **LM Studio**, test the connection, and select a discovered model.

The desktop calls the loopback OpenAI-compatible model list and chat-completions
endpoints. Disable LM Studio API-token enforcement for this Version 1.0
loopback-only integration; the companion never stores an LM Studio token.
No-AI mode remains the default and every deterministic feature works without
LM Studio.
