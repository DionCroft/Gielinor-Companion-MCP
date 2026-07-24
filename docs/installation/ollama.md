# Ollama installation

Ollama is an optional local model provider for the standalone desktop. Ollama is
not itself the MCP host in this setup.

1. Install and start [Ollama](https://docs.ollama.com/quickstart).
2. Pull a model whose metadata advertises the `tools` capability. The official
   [tool-calling guide](https://docs.ollama.com/capabilities/tool-calling) uses
   `qwen3`:

   ```sh
   ollama pull qwen3
   ```

3. Open **AI providers** in Gielinor Companion.
4. Select **Ollama** and retain `http://127.0.0.1:11434`.
5. Choose **Test and discover models**, select a model, and ask a planning
   question.

The adapter uses Ollama's documented
[`GET /api/tags`](https://docs.ollama.com/api/tags),
[`POST /api/show`](https://docs.ollama.com/api-reference/show-model-details), and
[`POST /api/chat`](https://docs.ollama.com/api/chat) endpoints. Models without
declared tool support are filtered. Tool names, inputs, and outputs remain
validated by the same stable contracts used by MCP clients.

Only loopback HTTP is accepted. The desktop does not send an Ollama API key,
download models, or expose Ollama to the network. Increase the request timeout
if local inference is slow. No-AI mode works without Ollama.

Optional live inference check:

```sh
corepack pnpm test:live:ollama
```
