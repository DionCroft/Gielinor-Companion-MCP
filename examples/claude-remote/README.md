# Claude and Claude Desktop remote connector

Deploy Version 0.7 behind HTTPS and add this custom connector URL:

```text
https://mcp.example.com/mcp
```

In Claude or Claude Desktop, open **Settings → Connectors**, add a custom
connector, and enable only the tools you intend to use. Team and Enterprise
workspaces may require an owner to configure the organization connector.

Use the anonymous public surface. Version 0.7 does not implement OAuth, so its
optional bearer-token profile accounts are not presented as an authenticated
Claude.ai connector. Claude Code can configure that bearer header directly; see
[the Claude Code example](../claude-code/README.md).

Anthropic currently documents both authless and OAuth remote servers and
recommends Streamable HTTP for new connectors. Confirm current plan and platform
availability in the
[official custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
