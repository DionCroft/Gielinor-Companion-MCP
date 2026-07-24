import { describe, expect, it } from "vitest";

import { ResilientHttpClient, type ProviderError } from "../src/http.js";

describe("ResilientHttpClient", () => {
  it("retries transient HTTP failures", async () => {
    let calls = 0;
    const fetchImplementation: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 503 })
        : new Response("ok", { status: 200 });
    };
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 1,
      fetchImplementation,
      sleep: async () => undefined,
    });

    expect(await (await client.get(new URL("https://example.test"))).text()).toBe("ok");
    expect(calls).toBe(2);
  });

  it("turns request timeouts into a stable provider error", async () => {
    const fetchImplementation: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const client = new ResilientHttpClient({
      userAgent: "test",
      timeoutMs: 5,
      retries: 0,
      fetchImplementation,
    });

    await expect(client.get(new URL("https://example.test"))).rejects.toMatchObject<
      Partial<ProviderError>
    >({ code: "PROVIDER_TIMEOUT" });
  });

  it("deduplicates concurrent requests and returns independently readable responses", async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 0,
      fetchImplementation: async () => {
        calls += 1;
        await gate;
        return new Response('{"ok":true}', { status: 200 });
      },
    });
    const url = new URL("https://example.test/shared");
    const first = client.get(url);
    const second = client.get(url);
    release?.();

    const [left, right] = await Promise.all([first, second]);
    expect(await left.json()).toEqual({ ok: true });
    expect(await right.json()).toEqual({ ok: true });
    expect(calls).toBe(1);
  });
});
