# Ollama and LM Studio local AI

Version 0.6 can ask a local model to choose among the same 48 validated tools
that MCP clients use. AI is optional: **No-AI mode** is the default and every
deterministic dashboard feature remains available without a model.

The desktop accepts only loopback endpoints:

```text
http://127.0.0.1:<port>
http://localhost:<port>
http://[::1]:<port>
```

Remote hosts, embedded credentials, query strings, redirects, and cloud API keys
are rejected. Provider requests use Tauri's native HTTP client with a matching
loopback-only capability scope, so no browser CORS change is required.

## Ollama

1. Install and start [Ollama](https://docs.ollama.com/quickstart).
2. Install a model whose Ollama metadata advertises the `tools` capability. The
   [official tool-calling guide](https://docs.ollama.com/capabilities/tool-calling)
   uses `qwen3` in its examples:

   ```sh
   ollama pull qwen3
   ```

3. Open **AI providers** in Gielinor Companion.
4. Select **Ollama** and keep the default endpoint:

   ```text
   http://127.0.0.1:11434
   ```

5. Choose **Test and discover models**, select a discovered model, and ask a
   question.

The adapter uses Ollama's documented
[`GET /api/tags`](https://docs.ollama.com/api/tags),
[`POST /api/show`](https://docs.ollama.com/api-reference/show-model-details), and
[`POST /api/chat`](https://docs.ollama.com/api/chat) endpoints. Embedding-only or
other non-tool models are filtered from the selector.

If Ollama is reachable but no model appears, install a tool-capable chat model.
If generation is slow, increase the request timeout up to 120 seconds.

## LM Studio

1. Install LM Studio and download a chat model. A model with LM Studio's native
   tool-use badge is the most reliable choice; see the
   [official tool-use guide](https://lmstudio.ai/docs/developer/openai-compat/tools).
2. In LM Studio's **Developer** tab, start the Local Server. The documented
   default port is `1234`; `lms server start` is the CLI equivalent.
3. Open **AI providers** in Gielinor Companion.
4. Select **LM Studio** and keep the default endpoint:

   ```text
   http://127.0.0.1:1234
   ```

5. Choose **Test and discover models**, select a model, and ask a question.

The adapter uses LM Studio's documented OpenAI-compatible
[`GET /v1/models`](https://lmstudio.ai/docs/developer/openai-compat) and
[`POST /v1/chat/completions`](https://lmstudio.ai/docs/developer/openai-compat/tools)
endpoints. If just-in-time loading is disabled, load the model in LM Studio
before sending a message.

Version 0.6 does not collect or store LM Studio API tokens. Disable optional
local-server authentication for this loopback-only integration.

## Trusted-tool behavior

- Tool names and inputs come from shared Zod definitions.
- Inputs are validated before any companion tool runs.
- Tool outputs must be source-stamped companion envelopes before the model sees
  them.
- Unknown, invalid, failed, or oversized calls are shown as failures; they
  cannot become successful tool activity.
- A model turn can request at most eight calls.
- The desktop allows 1–10 tool loops and a 1–120 second overall request timeout.
- Supported providers can request independent calls in parallel.
- Tool activity is visible beside the conversation.
- Conversation history stays in memory and can be reset at any time.

These tools can update companion-local profile state, such as a manually tracked
quest status. They never click, type, read client memory, place trades, or
control RuneScape.

## Optional live checks

These tests require a running local server and perform real model inference:

```sh
corepack pnpm test:live:ollama
corepack pnpm test:live:lm-studio
```

Override the endpoint or selected model when needed:

```sh
GIELINOR_OLLAMA_ENDPOINT=http://127.0.0.1:11434 \
GIELINOR_OLLAMA_MODEL=qwen3 \
corepack pnpm test:live:ollama
```

PowerShell:

```powershell
$env:GIELINOR_OLLAMA_MODEL = "qwen3"
corepack pnpm test:live:ollama
```

The command distinguishes unreachable providers, missing models, timeouts, and
invalid provider responses. It is deliberately excluded from deterministic CI.
