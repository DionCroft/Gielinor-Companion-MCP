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
    >({
      code: "PROVIDER_TIMEOUT",
      gielinorError: expect.objectContaining({ code: "GC-NET-001" }),
    });
  });

  it("classifies injected DNS failures without leaking host details", async () => {
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 0,
      fetchImplementation: async () => {
        throw Object.assign(new TypeError("getaddrinfo ENOTFOUND private.internal"), {
          code: "ENOTFOUND",
        });
      },
    });

    const request = client.get(new URL("https://example.test"));
    await expect(request).rejects.toMatchObject({
      retryable: true,
      gielinorError: expect.objectContaining({ code: "GC-NET-002" }),
    });
    await expect(request).rejects.not.toThrow("private.internal");
  });

  it("bounds retries for injected HTTP 500 failures", async () => {
    let calls = 0;
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 2,
      fetchImplementation: async () => {
        calls += 1;
        return new Response(null, { status: 500 });
      },
      sleep: async () => undefined,
    });

    await expect(client.get(new URL("https://example.test"))).rejects.toMatchObject({
      retryable: true,
      status: 500,
      gielinorError: expect.objectContaining({ code: "GC-PROVIDER-001" }),
    });
    expect(calls).toBe(3);
  });

  it("honours Retry-After and emits classified attempt telemetry", async () => {
    let calls = 0;
    const delays: number[] = [];
    const events: Array<{ outcome: string; nextDelayMs?: number }> = [];
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 1,
      random: () => 0,
      fetchImplementation: async () => {
        calls += 1;
        return calls === 1
          ? new Response(null, {
              status: 429,
              headers: { "retry-after": "2" },
            })
          : new Response("ready", { status: 200 });
      },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      onAttempt: (event) => events.push(event),
    });

    expect(await (await client.get(new URL("https://example.test"))).text()).toBe("ready");
    expect(delays).toEqual([2_000]);
    expect(events).toEqual([
      expect.objectContaining({
        outcome: "failure",
        nextDelayMs: 2_000,
        classification: expect.objectContaining({
          kind: "rate-limit",
          code: "GC-PROVIDER-002",
        }),
      }),
      expect.objectContaining({ outcome: "success" }),
    ]);
  });

  it("does not retry non-transient 4xx responses", async () => {
    let calls = 0;
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 3,
      fetchImplementation: async () => {
        calls += 1;
        return new Response(null, { status: 400 });
      },
      sleep: async () => undefined,
    });

    await expect(client.get(new URL("https://example.test"))).rejects.toMatchObject({
      retryable: false,
      status: 400,
      gielinorError: expect.objectContaining({ code: "GC-DATA-001" }),
    });
    expect(calls).toBe(1);
  });

  it("supports caller cancellation without sharing the cancelled request", async () => {
    const controller = new AbortController();
    const client = new ResilientHttpClient({
      userAgent: "test",
      retries: 2,
      fetchImplementation: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      sleep: async () => undefined,
    });
    const request = client.get(new URL("https://example.test"), {
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({
      retryable: false,
      gielinorError: expect.objectContaining({ code: "GC-NET-004" }),
    });
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
