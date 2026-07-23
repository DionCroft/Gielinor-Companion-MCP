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
});
