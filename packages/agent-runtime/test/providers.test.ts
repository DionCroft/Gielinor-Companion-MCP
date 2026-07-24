import {
  FetchJsonTransport,
  LmStudioProvider,
  OllamaProvider,
  normalizeLoopbackEndpoint,
  type JsonTransport,
  type JsonTransportRequest,
  type JsonTransportResponse,
} from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

class StubTransport implements JsonTransport {
  public readonly requests: JsonTransportRequest[] = [];
  private readonly responses: JsonTransportResponse[];

  public constructor(...responses: JsonTransportResponse[]) {
    this.responses = responses;
  }

  public request(request: JsonTransportRequest): Promise<JsonTransportResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected transport request");
    }
    return Promise.resolve(response);
  }
}

const modelRequest = {
  model: "tool-model",
  messages: [{ role: "user" as const, content: "Price coal" }],
  tools: [],
  timeoutMs: 5_000,
};

describe("local provider adapters", () => {
  it("discovers Ollama models and normalizes tool calls", async () => {
    const transport = new StubTransport(
      {
        status: 200,
        body: { models: [{ name: "qwen3:8b" }, { name: "llama3.2:3b" }] },
      },
      { status: 200, body: { capabilities: ["completion", "tools"] } },
      { status: 200, body: { capabilities: ["completion", "tools"] } },
      {
        status: 200,
        body: {
          message: {
            content: "",
            tool_calls: [
              {
                function: {
                  name: "search_items",
                  arguments: { query: "coal" },
                },
              },
            ],
          },
          done_reason: "stop",
        },
      },
    );
    const adapter = new OllamaProvider("http://127.0.0.1:11434/", transport);

    await expect(adapter.discoverModels(5_000)).resolves.toEqual(["llama3.2:3b", "qwen3:8b"]);
    await expect(adapter.chat(modelRequest)).resolves.toMatchObject({
      toolCalls: [{ name: "search_items", arguments: { query: "coal" } }],
    });
    expect(transport.requests[0]?.url).toBe("http://127.0.0.1:11434/api/tags");
    expect(transport.requests[1]?.url).toBe("http://127.0.0.1:11434/api/show");
    expect(transport.requests[3]?.url).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("filters non-chat Ollama embedding models during discovery", async () => {
    const adapter = new OllamaProvider(
      "http://127.0.0.1:11434",
      new StubTransport(
        {
          status: 200,
          body: { models: [{ name: "nomic-embed-text" }, { name: "qwen3:8b" }] },
        },
        { status: 200, body: { capabilities: ["embedding"] } },
        { status: 200, body: { capabilities: ["completion", "tools"] } },
      ),
    );

    await expect(adapter.discoverModels(5_000)).resolves.toEqual(["qwen3:8b"]);
  });

  it("discovers LM Studio models and parses OpenAI-compatible calls", async () => {
    const transport = new StubTransport(
      { status: 200, body: { data: [{ id: "local/qwen" }] } },
      {
        status: 200,
        body: {
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    function: {
                      name: "search_quests",
                      arguments: '{"query":"plague"}',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    );
    const adapter = new LmStudioProvider("http://localhost:1234", transport);

    await expect(adapter.discoverModels(5_000)).resolves.toEqual(["local/qwen"]);
    await expect(adapter.chat(modelRequest)).resolves.toMatchObject({
      toolCalls: [
        {
          id: "call-1",
          name: "search_quests",
          arguments: { query: "plague" },
        },
      ],
    });
  });

  it("reports unavailable models, provider failures, partial data, and malformed JSON", async () => {
    const notFound = new OllamaProvider(
      "http://127.0.0.1:11434",
      new StubTransport({ status: 404, body: { error: "model not found" } }),
    );
    await expect(notFound.chat(modelRequest)).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    });

    const unloaded = new LmStudioProvider(
      "http://localhost:1234",
      new StubTransport({ status: 400, body: { error: "model is not loaded" } }),
    );
    await expect(unloaded.chat(modelRequest)).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    });

    const unavailable = new LmStudioProvider(
      "http://localhost:1234",
      new StubTransport({ status: 503, body: null }),
    );
    await expect(unavailable.discoverModels(5_000)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });

    const partial = new OllamaProvider(
      "http://127.0.0.1:11434",
      new StubTransport({ status: 200, body: { done: false } }),
    );
    await expect(partial.chat(modelRequest)).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_INVALID",
    });

    const malformedCall = new LmStudioProvider(
      "http://localhost:1234",
      new StubTransport({
        status: 200,
        body: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "bad",
                    function: { name: "search_items", arguments: "{not-json" },
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    await expect(malformedCall.chat(modelRequest)).rejects.toMatchObject({
      code: "MALFORMED_TOOL_CALL",
    });
  });

  it("accepts only loopback endpoints in local-only mode", () => {
    expect(normalizeLoopbackEndpoint("http://localhost:1234/")).toBe("http://localhost:1234");
    expect(() => normalizeLoopbackEndpoint("https://models.example.com")).toThrow(/loopback/i);
    expect(() => normalizeLoopbackEndpoint("https://localhost:1234")).toThrow(/loopback/i);
    expect(() => normalizeLoopbackEndpoint("http://user:secret@localhost:1234")).toThrow(
      /without credentials/i,
    );
  });

  it("classifies fetch failures and malformed transport responses safely", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("private network details"));
    const transport = new FetchJsonTransport();
    await expect(
      transport.request({
        method: "GET",
        url: "http://127.0.0.1:11434/api/tags",
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: expect.not.stringContaining("private network details"),
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("{invalid"),
    });
    await expect(
      transport.request({
        method: "GET",
        url: "http://127.0.0.1:11434/api/tags",
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_RESPONSE_INVALID" });
    globalThis.fetch = originalFetch;
  });
});
