import type { PriceProvider, ProfileService } from "@gielinor/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createCompanionServer } from "../src/server.js";
import { CompanionToolService } from "../src/tool-service.js";

const servers: ReturnType<typeof createCompanionServer>[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("MCP server protocol integration", () => {
  it("lists tools and returns structured XP results over an MCP transport", async () => {
    const service = new CompanionToolService({} as ProfileService, {} as PriceProvider);
    const server = createCompanionServer(service);
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("calculate_xp_remaining");

    const result = await client.callTool({
      name: "calculate_xp_remaining",
      arguments: { currentExperience: 1_000_000, targetLevel: 99 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        currentLevel: 73,
        targetExperience: 13_034_431,
        experienceRemaining: 12_034_431,
      },
      meta: { source: "deterministic RuneScape XP table" },
    });
  });
});
