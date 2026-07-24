import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import type { HostedConfig } from "../src/config.js";
import {
  createHostedHttpServer,
  type HostedHttpServer,
  type HostedLogRecord,
} from "../src/http-server.js";

type RunningServer = {
  hosted: HostedHttpServer;
  url: string;
  directory: string;
  logs: HostedLogRecord[];
};

const runningServers: RunningServer[] = [];
const clients: Client[] = [];

function testConfig(directory: string, overrides: Partial<HostedConfig> = {}): HostedConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    publicDatabasePath: join(directory, "public.db"),
    controlDatabasePath: join(directory, "control.db"),
    accountDirectory: join(directory, "accounts"),
    accountCreationEnabled: true,
    allowedOrigins: new Set(),
    allowedHosts: new Set(["127.0.0.1"]),
    trustProxy: false,
    requireHttps: false,
    operatorToken: "operator-token-that-is-at-least-32-characters",
    maxRequestBytes: 16_384,
    maxBatchMessages: 4,
    requestsPerMinute: 100,
    toolCallsPerMinute: 100,
    requestTimeoutMs: 10_000,
    shutdownTimeoutMs: 1_000,
    userAgent: "Gielinor-Hosted-Test/1.0.0",
    ...overrides,
  };
}

async function start(overrides: Partial<HostedConfig> = {}): Promise<RunningServer> {
  const directory = mkdtempSync(join(tmpdir(), "gielinor-hosted-"));
  const logs: HostedLogRecord[] = [];
  const hosted = createHostedHttpServer(testConfig(directory, overrides), {
    logger: (record) => logs.push(record),
  });
  const address = await hosted.start();
  const running = {
    hosted,
    url: `http://${address.host}:${address.port}`,
    directory,
    logs,
  };
  runningServers.push(running);
  return running;
}

async function createAccount(url: string): Promise<{ accountId: string; accessToken: string }> {
  const response = await fetch(`${url}/v1/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { accountId: string; accessToken: string };
}

async function connect(url: string, token?: string): Promise<Client> {
  const client = new Client({ name: "hosted-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const running of runningServers.splice(0)) {
    await running.hosted.close();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    rmSync(running.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});

describe("hosted Streamable HTTP service", () => {
  it("serves health, readiness, and the MCP protocol without server state", async () => {
    const running = await start();
    const live = await fetch(`${running.url}/health/live`);
    expect(live.status).toBe(200);
    expect(live.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(live.json()).resolves.toMatchObject({ status: "ok", version: "1.0.0" });

    const ready = await fetch(`${running.url}/health/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({
      status: "ready",
      storage: "ready",
      datasets: {
        quests: "never-synced",
        training: "never-synced",
        prices: "never-synced",
      },
    });

    const client = await connect(running.url);
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(48);
    const xp = await client.callTool({
      name: "calculate_xp_remaining",
      arguments: { currentExperience: 1_000_000, targetLevel: 99 },
    });
    expect(xp.structuredContent).toMatchObject({
      data: { currentLevel: 73, experienceRemaining: 12_034_431 },
    });
    const privateResult = await client.callTool({
      name: "list_player_profiles",
      arguments: {},
    });
    expect(privateResult.isError).toBe(true);
    expect(privateResult.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("AUTH_REQUIRED") }),
      ]),
    );
  });

  it("isolates authenticated profile data between accounts", async () => {
    const running = await start();
    const accountA = await createAccount(running.url);
    const accountB = await createAccount(running.url);
    const clientA = await connect(running.url, accountA.accessToken);
    const clientB = await connect(running.url, accountB.accessToken);

    const created = await clientA.callTool({
      name: "create_player_profile",
      arguments: { displayName: "AcctAFix", gameMode: "normal" },
    });
    expect(created.isError, JSON.stringify(created)).not.toBe(true);
    const profileId = (created.structuredContent as { data: { id: string } } | undefined)?.data.id;
    expect(profileId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const listA = await clientA.callTool({ name: "list_player_profiles", arguments: {} });
    expect(listA.structuredContent).toMatchObject({
      data: [expect.objectContaining({ id: profileId, displayName: "AcctAFix" })],
    });
    const listB = await clientB.callTool({ name: "list_player_profiles", arguments: {} });
    expect(listB.structuredContent).toMatchObject({ data: [] });
    const crossUserRead = await clientB.callTool({
      name: "get_player_profile",
      arguments: { profileId },
    });
    expect(crossUserRead.isError).toBe(true);
    expect(crossUserRead.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("NOT_FOUND") }),
      ]),
    );

    const exported = await fetch(`${running.url}/v1/account/export`, {
      headers: { authorization: `Bearer ${accountA.accessToken}` },
    });
    expect(exported.status).toBe(200);
    await expect(exported.json()).resolves.toMatchObject({
      schemaVersion: 1,
      profiles: [expect.objectContaining({ displayName: "AcctAFix" })],
    });
  });

  it("imports portable profiles and permanently revokes a deleted account", async () => {
    const running = await start();
    const account = await createAccount(running.url);
    const imported = await fetch(`${running.url}/v1/account/import`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            schemaVersion: 1,
            displayName: "ImportedFix",
            gameMode: "normal",
            completedQuestIds: [],
            inProgressQuestIds: [],
            goals: [],
          },
        ],
      }),
    });
    expect(imported.status, await imported.clone().text()).toBe(200);
    await expect(imported.json()).resolves.toMatchObject({
      importedProfileIds: [expect.any(String)],
    });

    const deleted = await fetch(`${running.url}/v1/account`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${account.accessToken}` },
    });
    expect(deleted.status).toBe(204);
    expect(existsSync(join(running.directory, "accounts", `${account.accountId}.db`))).toBe(false);
    const revoked = await fetch(`${running.url}/v1/account/export`, {
      headers: { authorization: `Bearer ${account.accessToken}` },
    });
    expect(revoked.status).toBe(401);
  });

  it("rejects invalid origins, tokens, oversized requests, and excess traffic", async () => {
    const running = await start({
      maxRequestBytes: 1_024,
      requestsPerMinute: 3,
    });
    const badOrigin = await fetch(`${running.url}/health`, {
      headers: { origin: "https://untrusted.example" },
    });
    expect(badOrigin.status).toBe(403);

    const badToken = await fetch(`${running.url}/v1/account/export`, {
      headers: { authorization: `Bearer ${"x".repeat(40)}` },
    });
    expect(badToken.status).toBe(401);

    const oversized = await fetch(`${running.url}/v1/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(2_000) }),
    });
    expect(oversized.status).toBe(413);

    await fetch(`${running.url}/does-not-exist`);
    await fetch(`${running.url}/does-not-exist`);
    const limited = await fetch(`${running.url}/does-not-exist`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("enforces the separate tool-call budget and keeps logs free of tokens", async () => {
    const running = await start({ toolCallsPerMinute: 1 });
    const account = await createAccount(running.url);
    const client = await connect(running.url, account.accessToken);
    const first = await client.callTool({
      name: "calculate_xp_remaining",
      arguments: { currentExperience: 0, targetLevel: 2 },
    });
    expect(first.isError).not.toBe(true);
    await expect(
      client.callTool({
        name: "calculate_xp_remaining",
        arguments: { currentExperience: 0, targetLevel: 3 },
      }),
    ).rejects.toThrow();
    expect(JSON.stringify(running.logs)).not.toContain(account.accessToken);
  });

  it("requires forwarded HTTPS when configured and keeps maintenance operator-only", async () => {
    const running = await start({ requireHttps: true, trustProxy: true });
    const insecure = await fetch(`${running.url}/health/live`);
    expect(insecure.status).toBe(426);
    const secure = await fetch(`${running.url}/health/live`, {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(secure.status).toBe(200);

    const wrongMediaType = await fetch(`${running.url}/v1/accounts`, {
      method: "POST",
      headers: { "x-forwarded-proto": "https" },
      body: "{}",
    });
    expect(wrongMediaType.status).toBe(415);

    const account = await fetch(`${running.url}/v1/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      body: "{}",
    });
    const token = ((await account.json()) as { accessToken: string }).accessToken;
    const client = new Client({ name: "hosted-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${running.url}/mcp`), {
      requestInit: {
        headers: {
          authorization: `Bearer ${token}`,
          "x-forwarded-proto": "https",
        },
      },
    });
    await client.connect(transport);
    clients.push(client);
    const maintenance = await client.callTool({
      name: "refresh_quest_data",
      arguments: {},
    });
    expect(maintenance.isError).toBe(true);
    expect(maintenance.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("OPERATOR_REQUIRED") }),
      ]),
    );
  });

  it("keeps account creation disabled when the operator has not enabled it", async () => {
    const running = await start({ accountCreationEnabled: false });
    const response = await fetch(`${running.url}/v1/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain("ACCOUNT_CREATION_DISABLED");
    expect(body).not.toMatch(/stack|node_modules|[A-Z]:\\/i);
  });
});
