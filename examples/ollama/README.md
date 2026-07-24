# Ollama local provider

The Version 1 desktop includes the completed bounded Ollama adapter. Install a
model that declares tool support, start Ollama on its default loopback endpoint,
and configure it from **AI providers** in the desktop:

```sh
ollama pull qwen3
```

The desktop discovers installed models, validates all tool calls against the
stable shared schemas, and shows tool activity. Ollama is optional; it is not
the MCP host and every deterministic dashboard feature works in no-AI mode.

See [the complete Ollama guide](../../docs/installation/ollama.md).
