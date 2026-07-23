import { describe, expect, it } from "vitest";

import { ResilientHttpClient } from "../src/http.js";
import {
  RuneScapeWikiQuestProvider,
  parseQuestItems,
  parseQuestRequirementModule,
} from "../src/runescape-wiki-quests.js";

const MODULE_SOURCE = `
local quests = {
  ["Prerequisite"] = {},
  ["Target Quest"] = {"Prerequisite", "Misc:50 quest points"},
  ["Partial Target"] = {"Partial:Prerequisite"},
  ["Full:Target Quest"] = {"Follows:Optional Lore"},
}
return quests
`;

function revisionPage(title: string, revisionId: number, content = "") {
  return {
    pageid: revisionId,
    title,
    revisions: [
      {
        revid: revisionId,
        timestamp: "2026-07-23T12:00:00Z",
        slots: { main: { content } },
      },
    ],
  };
}

function wikiFetch(): typeof fetch {
  return async (input) => {
    const url =
      input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.searchParams.get("action") === "bucket") {
      const query = url.searchParams.get("query") ?? "";
      if (query.startsWith("bucket('quest')")) {
        return Response.json({
          bucket: [
            {
              page_name: "Prerequisite",
              page_name_sub: "Prerequisite",
              json: JSON.stringify({
                name: "Prerequisite",
                members: "No",
                items: "* 2 [[Rune bar]]",
              }),
              official_length: "Short",
              requirement_skill: ["Mining"],
              requirement_skill_level: ["Mining:20"],
            },
            {
              page_name: "Target Quest",
              page_name_sub: "Target Quest",
              json: JSON.stringify({
                name: "Target Quest",
                members: "Yes",
                items: "* 3 [[Rune bar]]\n* [[Plant cure]] or [[Cure Plant]]",
                recommended: "* [[Games necklace]]",
              }),
              official_length: "Long",
              requirements:
                '* <span class="skillreq" data-skill="Crafting" data-level="50">50 Crafting</span>',
              requirement_skill: ["Crafting", "quest points"],
              requirement_skill_level: ["Crafting:50", "quest points:10"],
            },
          ],
        });
      }
      if (query.startsWith("bucket('quest_rewards')")) {
        return Response.json({
          bucket: [
            {
              page_name: "Prerequisite",
              page_name_sub: "Prerequisite",
              quest_points: 1,
              rewards: "* 1,000 [[File:Mining-icon.png|21x21px|link=Mining|alt=Mining]] experience",
            },
            {
              page_name: "Target Quest",
              page_name_sub: "Target Quest",
              quest_points: 2,
              rewards: "* Access to [[Example area]]",
            },
          ],
        });
      }
      return Response.json({
        bucket: [
          {
            page_name: "Prerequisite",
            page_name_sub: "Prerequisite",
            name: "Prerequisite",
            is_members_only: false,
            official_difficulty: "Novice",
            quest_type: "quest",
            id: 1,
          },
          {
            page_name: "Target Quest",
            page_name_sub: "Target Quest",
            name: "Target Quest",
            is_members_only: true,
            official_difficulty: "Master",
            quest_type: "quest",
            id: 2,
          },
        ],
      });
    }

    const titles = (url.searchParams.get("titles") ?? "").split("|");
    if (titles.includes("Module:Questreq/data")) {
      return Response.json({
        query: { pages: [revisionPage("Module:Questreq/data", 900, MODULE_SOURCE)] },
      });
    }
    return Response.json({
      query: {
        pages: titles.map((title, index) => revisionPage(title, 100 + index, "quest source")),
      },
    });
  };
}

describe("RuneScape Wiki quest parsers", () => {
  it("parses direct, partial, full, follows, and miscellaneous prerequisite markers", () => {
    const parsed = parseQuestRequirementModule(MODULE_SOURCE);
    expect(parsed.get("Target Quest")).toEqual(["Prerequisite", "Misc:50 quest points"]);
    expect(parsed.get("Partial Target")).toEqual(["Partial:Prerequisite"]);
    expect(parsed.get("Full:Target Quest")).toEqual(["Follows:Optional Lore"]);
  });

  it("normalizes item quantities and explicit alternatives", () => {
    expect(
      parseQuestItems(
        "* 10 [[magic logs]]\n* [[Plant cure]] or [[Cure Plant]]\n** nested note\n* None",
      ),
    ).toEqual([
      { name: "magic logs", quantity: 10 },
      { name: "Plant cure", quantity: 1, alternatives: ["Cure Plant"] },
    ]);
  });
});

describe("RuneScapeWikiQuestProvider", () => {
  it("combines Bucket facts, prerequisite data, and MediaWiki revisions", async () => {
    const provider = new RuneScapeWikiQuestProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        fetchImplementation: wikiFetch(),
      }),
      now: () => new Date("2026-07-23T13:00:00.000Z"),
    });

    const snapshot = await provider.fetchSnapshot();
    expect(snapshot.provider).toBe("RuneScape Wiki");
    expect(snapshot.sourceRevision).toMatch(/^900:[a-f0-9]{64}$/);
    expect(snapshot.quests).toHaveLength(2);
    expect(snapshot.quests.find((quest) => quest.id === "target-quest")).toMatchObject({
      name: "Target Quest",
      members: true,
      difficulty: "Master",
      questPointReward: 2,
      prerequisiteQuestIds: ["prerequisite"],
      prerequisiteGroups: [
        {
          mode: "all",
          quests: [{ questId: "prerequisite", requiredStatus: "completed" }],
        },
      ],
      skillRequirements: [{ skillId: "crafting", level: 50 }],
      questPointRequirement: 10,
      otherRequirements: ["50 quest points"],
      itemRequirements: [
        { name: "Rune bar", quantity: 3 },
        { name: "Plant cure", quantity: 1, alternatives: ["Cure Plant"] },
      ],
      recommendedItems: [{ name: "Games necklace", quantity: 1 }],
      rewards: [
        { type: "quest-points", amount: 2, description: "2 quest points" },
        { type: "unlock", description: "Access to Example area" },
      ],
      sourceRevision: "101:900",
    });
  });

  it("reports an empty Bucket response distinctly", async () => {
    const provider = new RuneScapeWikiQuestProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        retries: 0,
        fetchImplementation: async (input) => {
          const url =
            input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
          if (url.searchParams.get("action") === "bucket") {
            return Response.json({ bucket: [] });
          }
          return Response.json({
            query: { pages: [revisionPage("Module:Questreq/data", 900, MODULE_SOURCE)] },
          });
        },
      }),
    });

    await expect(provider.fetchSnapshot()).rejects.toMatchObject({
      code: "EMPTY_PROVIDER_RESPONSE",
    });
  });

  it("propagates provider timeouts without claiming refresh success", async () => {
    const provider = new RuneScapeWikiQuestProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        timeoutMs: 5,
        retries: 0,
        fetchImplementation: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      }),
    });

    await expect(provider.fetchSnapshot()).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });
});
