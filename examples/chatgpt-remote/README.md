# ChatGPT remote MCP

Deploy Version 0.7 behind HTTPS, then use this endpoint:

```text
https://mcp.example.com/mcp
```

For the public read-only tools, choose no authentication. In ChatGPT developer
mode, create a custom app, provide the endpoint, scan the tools, test it as a
draft, and have an administrator publish it when appropriate. Current
availability, plan requirements, and workspace controls can change; verify the
[official ChatGPT developer-mode guidance](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta).

Version 0.7 account tokens are fixed bearer headers, not OAuth. ChatGPT's custom
app setup should therefore use the anonymous public tool surface. Do not paste a
Gielinor bearer token into a conversation. Authenticated profiles are supported
by MCP clients that can configure an Authorization header, such as Claude Code.

ChatGPT connects to remote servers, not the local stdio process. Keep the
service's Node port private and expose only the HTTPS reverse proxy.
