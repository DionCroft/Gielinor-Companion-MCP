# Version 0.6 local-AI data behavior

Version 0.6 adds no RuneScape game-data source. Ollama and LM Studio are optional
local inference providers that can select among the existing 48 trusted
companion tools. All player facts, XP calculations, quest routes, training
plans, and Grand Exchange values still come from the deterministic core and
validated provider/cache layers documented in Versions 0.1–0.5.

## Provider contracts

| Provider  | Discovery                                                              | Chat                                                         | Authentication      |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------- |
| Ollama    | `GET /api/tags`, then `POST /api/show` for explicit `tools` capability | `POST /api/chat`, non-streaming                              | None on loopback    |
| LM Studio | OpenAI-compatible `GET /v1/models`                                     | OpenAI-compatible `POST /v1/chat/completions`, non-streaming | None in Version 0.6 |

The user chooses the provider, endpoint, model, timeout, and loop limit. No
provider is contacted in No-AI mode. Endpoints must resolve syntactically to
`localhost`, `127.0.0.1`, or `::1`; the Tauri HTTP permission repeats the same
restriction.

## Validation and provenance

Model responses are untrusted orchestration suggestions. Provider JSON is
runtime-validated before it becomes a normalized response. Each requested tool
name must exist in the shared registry and each input must pass its Zod schema.
The tool result must pass the shared source-stamped `ToolEnvelope` schema and
size limit before it enters model context.

The model cannot replace or write provider cache records directly. External
RuneScape refreshes continue to use timeouts, validation, provenance,
transactions, and last-valid rollback. The conversation UI separately shows
whether each trusted call succeeded or failed.

## Retention and privacy

Conversation messages and tool activity are held in React memory only. They are
not written to SQLite or browser storage. Provider choice, loopback endpoint,
selected model name, timeout, and loop limit are stored locally; these values
contain no credentials.

No cloud model API, telemetry endpoint, or hosted service is contacted by the
local agent runtime. Native HTTP redirects are disabled.
