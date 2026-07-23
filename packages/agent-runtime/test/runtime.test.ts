import { LocalAiError, LocalAgentRuntime, type LocalModelProvider } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

function envelope(data: unknown) {
  return {
    data,
    meta: {
      generatedAt: "2026-07-23T12:00:00.000Z",
      source: "deterministic test tool",
    },
  };
}

function provider(
  responses: Array<{
    content: string;
    toolCalls: Array<{ id: string; name: string; arguments: unknown }>;
  }>,
  parallelToolCalls = true,
): LocalModelProvider {
  let index = 0;
  return {
    id: "ollama",
    displayName: "Test provider",
    capabilities: { modelDiscovery: true, parallelToolCalls },
    discoverModels: () => Promise.resolve(["test-model"]),
    chat: () => {
      const response = responses[index];
      index += 1;
      if (response === undefined) {
        throw new Error("Unexpected model turn");
      }
      return Promise.resolve(response);
    },
  };
}

const options = {
  prompt: "How much XP do I need?",
  model: "test-model",
  timeoutMs: 5_000,
  maxToolLoops: 4,
};

describe("LocalAgentRuntime", () => {
  it("executes a validated single tool call before accepting the final answer", async () => {
    const execute = vi.fn().mockResolvedValue(envelope({ experienceRemaining: 1154 }));
    const runtime = new LocalAgentRuntime(
      provider([
        {
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "calculate_xp_remaining",
              arguments: { currentExperience: 0, targetLevel: 10, skillId: "mining" },
            },
          ],
        },
        { content: "You need 1,154 XP.", toolCalls: [] },
      ]),
      execute,
    );

    const result = await runtime.run(options);

    expect(result.answer).toBe("You need 1,154 XP.");
    expect(result.toolLoops).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      "calculate_xp_remaining",
      { currentExperience: 0, targetLevel: 10, skillId: "mining" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.activities[0]?.status).toBe("succeeded");
    expect(
      result.messages.some(
        (message) => message.role === "tool" && message.content.includes('"ok":true'),
      ),
    ).toBe(true);
  });

  it("supports multiple sequential model/tool turns", async () => {
    const execute = vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve(
          envelope(name === "search_items" ? [{ itemId: 4151 }] : { currentPrice: 83_753 }),
        ),
      );
    const runtime = new LocalAgentRuntime(
      provider(
        [
          {
            content: "",
            toolCalls: [{ id: "search", name: "search_items", arguments: { query: "whip" } }],
          },
          {
            content: "",
            toolCalls: [{ id: "details", name: "get_item_details", arguments: { item: 4151 } }],
          },
          { content: "The validated guide price is 83,753 GP.", toolCalls: [] },
        ],
        false,
      ),
      execute,
    );

    const result = await runtime.run({ ...options, prompt: "Price an abyssal whip." });

    expect(result.toolLoops).toBe(2);
    expect(execute.mock.calls.map((call) => call[0])).toEqual(["search_items", "get_item_details"]);
  });

  it("runs same-turn calls in parallel when the provider supports it", async () => {
    let active = 0;
    let peak = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn().mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      if (active === 2) {
        release?.();
      }
      await gate;
      active -= 1;
      return envelope({ ok: true });
    });
    const runtime = new LocalAgentRuntime(
      provider([
        {
          content: "",
          toolCalls: [
            { id: "one", name: "search_items", arguments: { query: "coal" } },
            { id: "two", name: "search_quests", arguments: { query: "plague" } },
          ],
        },
        { content: "Both lookups completed.", toolCalls: [] },
      ]),
      execute,
    );

    await runtime.run({ ...options, prompt: "Look up coal and Plague's End." });

    expect(peak).toBe(2);
  });

  it("rejects invalid arguments and unknown names without invoking a tool", async () => {
    const execute = vi.fn();
    let messagesSeen = "";
    const testProvider: LocalModelProvider = {
      ...provider([]),
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            {
              id: "invalid",
              name: "calculate_xp_remaining",
              arguments: { currentExperience: -1, targetLevel: 10 },
            },
            { id: "unknown", name: "control_game_client", arguments: {} },
          ],
        })
        .mockImplementationOnce((request) => {
          messagesSeen = JSON.stringify(request.messages);
          return Promise.resolve({ content: "I could not run those requests.", toolCalls: [] });
        }),
    };
    const runtime = new LocalAgentRuntime(testProvider, execute);

    const result = await runtime.run(options);

    expect(execute).not.toHaveBeenCalled();
    expect(result.activities.map((activity) => activity.status)).toEqual(["failed", "failed"]);
    expect(messagesSeen).toContain("INVALID_TOOL_ARGUMENTS");
    expect(messagesSeen).toContain("UNKNOWN_TOOL");
  });

  it("stops repeated tool loops at the configured maximum", async () => {
    let call = 0;
    const loopingProvider: LocalModelProvider = {
      ...provider([]),
      chat: () =>
        Promise.resolve({
          content: "",
          toolCalls: [
            {
              id: `loop-${String(++call)}`,
              name: "get_price_data_status",
              arguments: {},
            },
          ],
        }),
    };
    const runtime = new LocalAgentRuntime(loopingProvider, () =>
      Promise.resolve(envelope({ state: "ready" })),
    );

    await expect(runtime.run({ ...options, maxToolLoops: 2 })).rejects.toMatchObject({
      code: "LOOP_LIMIT_REACHED",
    });
    expect(call).toBe(3);
  });

  it("enforces the overall timeout", async () => {
    vi.useFakeTimers();
    const hangingProvider: LocalModelProvider = {
      ...provider([]),
      chat: () => new Promise(() => undefined),
    };
    const runtime = new LocalAgentRuntime(hangingProvider, () => Promise.resolve(envelope({})));
    const pending = runtime.run({ ...options, timeoutMs: 1_000 });
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1_001);

    await assertion;
    vi.useRealTimers();
  });

  it("rejects partial empty responses and invalid tool outputs", async () => {
    const emptyRuntime = new LocalAgentRuntime(provider([{ content: "", toolCalls: [] }]), () =>
      Promise.resolve(envelope({})),
    );
    await expect(emptyRuntime.run(options)).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_INVALID",
    });

    let secondTurnMessages = "";
    const invalidOutputProvider: LocalModelProvider = {
      ...provider([]),
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [{ id: "bad-output", name: "search_items", arguments: { query: "coal" } }],
        })
        .mockImplementationOnce((request) => {
          secondTurnMessages = JSON.stringify(request.messages);
          return Promise.resolve({ content: "The tool result was rejected.", toolCalls: [] });
        }),
    };
    const invalidRuntime = new LocalAgentRuntime(invalidOutputProvider, () =>
      Promise.resolve({ fabricated: true }),
    );
    await invalidRuntime.run(options);
    expect(secondTurnMessages).toContain("INVALID_TOOL_OUTPUT");
    expect(secondTurnMessages).not.toContain('"ok":true');
  });

  it("propagates safe tool errors and preserves bounded conversation state", async () => {
    let secondTurnMessages = "";
    const testProvider: LocalModelProvider = {
      ...provider([]),
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [{ id: "failed", name: "search_items", arguments: { query: "coal" } }],
        })
        .mockImplementationOnce((request) => {
          secondTurnMessages = JSON.stringify(request.messages);
          return Promise.resolve({ content: "The catalogue lookup failed safely.", toolCalls: [] });
        }),
    };
    const runtime = new LocalAgentRuntime(testProvider, () => {
      throw new LocalAiError("TOOL_FAILED", "The catalogue is unavailable.", true);
    });
    const result = await runtime.run({
      ...options,
      history: [
        { role: "system", content: "Prior trusted system context" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ],
    });

    expect(result.messages[0]).toEqual({
      role: "system",
      content: "Prior trusted system context",
    });
    expect(secondTurnMessages).toContain("The catalogue is unavailable.");
    expect(result.activities[0]?.status).toBe("failed");
  });
});
