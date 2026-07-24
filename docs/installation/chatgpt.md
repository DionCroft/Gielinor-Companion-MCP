# ChatGPT remote MCP installation

ChatGPT connects to a remote MCP endpoint, not the local stdio process. Deploy
the [hosted service](hosted.md) behind HTTPS and use:

```text
https://mcp.example.com/mcp
```

For the anonymous public tool surface choose no authentication. In a workspace
that currently supports custom MCP apps:

1. Enable developer mode according to the workspace's policy.
2. Open **Settings/Workspace settings → Apps → Create**.
3. Provide the HTTPS MCP endpoint and no authentication.
4. Scan the tools, review the requested capabilities, and test the draft.
5. Have an administrator/owner publish it for the workspace when appropriate.

OpenAI's current
[developer-mode and MCP-app guidance](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)
states that ChatGPT connects to remote servers, that plan/workspace permissions
apply, and that local/private-network servers need a supported secure tunnel.
Availability and UI can change; verify that page before deployment.

Gielinor hosted profiles use a fixed bearer header, not OAuth. ChatGPT's custom
app should therefore use anonymous public tools. Do not paste a Gielinor token
into a chat. A client with explicit header configuration, such as Claude Code,
is required for the current private-profile flow.

Keep the Node port private, expose only the TLS reverse proxy, validate Host and
Origin, and review every scanned tool. The service contains local-state profile
tools, but the anonymous policy rejects them with `AUTH_REQUIRED`; no tool can
control RuneScape gameplay.
