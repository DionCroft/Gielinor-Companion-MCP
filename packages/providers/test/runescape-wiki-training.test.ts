import { describe, expect, it } from "vitest";

import { ResilientHttpClient } from "../src/http.js";
import {
  TRAINING_PAGES,
  RuneScapeWikiTrainingProvider,
  parseRenderedTrainingTables,
  parseTrainingGuide,
  parseTrainingLevelRange,
  parseTrainingRate,
  parseTrainingSummaryTables,
  trainingTableBlocks,
  trainingTableCells,
} from "../src/runescape-wiki-training.js";

const CHECKED_AT = "2026-07-23T12:00:00.000Z";
const SUMMARY = `
===Summary===
{| class="wikitable"
! Levels
! Method
! Experience per hour
|-
| 1-10
| [[Copper ore|Copper]]/[[Tin ore|Tin]]
| 5,000
|-
| 10-20
| [[Iron ore|Iron]]
| 15,000-20,000
|}
`;

describe("RuneScape Wiki training parsers", () => {
  it("parses levels, compact units, ranges, and malformed values conservatively", () => {
    expect(parseTrainingLevelRange("Levels 89–97+")).toEqual({
      minimumLevel: 89,
      maximumLevel: 97,
    });
    expect(parseTrainingLevelRange("120+")).toEqual({ minimumLevel: 120 });
    expect(parseTrainingRate("150k-2m XP/hour")).toEqual({
      minimum: 150_000,
      maximum: 2_000_000,
      openEnded: false,
    });
    expect(parseTrainingRate("190,000 Mining experience an hour")).toEqual({
      minimum: 190_000,
      maximum: 190_000,
      openEnded: false,
    });
    expect(parseTrainingRate("999,999,999")).toBeNull();
    expect(parseTrainingRate("varies")).toBeNull();
  });

  it("parses strict wikitext summary rows with provenance", () => {
    const blocks = trainingTableBlocks(SUMMARY);
    expect(blocks).toHaveLength(1);
    const rows = (blocks[0] ?? "").split(/^\|-[^\r\n]*$/m).slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.map(trainingTableCells)).toEqual([
      ["1-10", "[[Copper ore|Copper]]/[[Tin ore|Tin]]", "5,000"],
      ["10-20", "[[Iron ore|Iron]]", "15,000-20,000"],
    ]);
    expect(parseTrainingSummaryTables(SUMMARY)).toHaveLength(2);
    const methods = parseTrainingGuide(
      {
        title: "Pay-to-play Mining training",
        revisionId: 123,
        timestamp: "2026-07-22T12:00:00Z",
        content: SUMMARY,
      },
      ["mining"],
      CHECKED_AT,
    );
    expect(methods.map((method) => method.id)).toEqual([
      "mining:1:10:copper-tin",
      "mining:10:20:iron",
    ]);
    expect(methods[0]).toMatchObject({
      id: "mining:1:10:copper-tin",
      name: "Copper/Tin",
      xpPerHourRange: { minimum: 5_000, maximum: 5_000 },
      sourceRevision: "123",
      lastCheckedAt: CHECKED_AT,
    });
    expect(methods[1]).toMatchObject({
      minimumLevel: 10,
      xpPerHourRange: { minimum: 15_000, maximum: 20_000 },
    });
  });

  it("parses rendered dynamic tables and preserves rate uncertainty", () => {
    const methods = parseRenderedTrainingTables(`
      <table>
        <tr>
          <th>Levels</th><th>Food to cook</th>
          <th>Approximate base XP/hour</th><th>Approximate XP/hour (portable range)</th>
          <th>Profit/loss per hour</th>
        </tr>
        <tr>
          <td>15-28</td><td>Trout</td><td>25k</td><td>30k</td><td>−50k</td>
        </tr>
        <tr>
          <td>28-52</td><td>Sweetcorn</td><td>150k</td><td>181k</td><td>100k</td>
        </tr>
      </table>
    `);
    expect(methods).toEqual([
      expect.objectContaining({
        name: "Trout",
        minimumLevel: 15,
        maximumLevel: 28,
        xpPerHourRange: { minimum: 25_000, maximum: 30_000 },
        gpPerHourRange: { minimum: -50_000, maximum: -50_000 },
      }),
      expect.objectContaining({
        name: "Sweetcorn",
        minimumLevel: 28,
        maximumLevel: 52,
        xpPerHourRange: { minimum: 150_000, maximum: 181_000 },
        gpPerHourRange: { minimum: 100_000, maximum: 100_000 },
      }),
    ]);
  });

  it("requires a complete all-skill snapshot and records a revision digest", async () => {
    const fetchImplementation: typeof fetch = async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      if (url.searchParams.get("action") === "query") {
        return Response.json({
          query: {
            pages: TRAINING_PAGES.map((page, index) => ({
              title: page.title,
              revisions: [
                {
                  revid: index + 1,
                  timestamp: "2026-07-22T12:00:00Z",
                  slots: { main: { content: SUMMARY } },
                },
              ],
            })),
          },
        });
      }
      const revision = Number(url.searchParams.get("oldid"));
      return Response.json({
        parse: {
          title: `Fixture ${revision}`,
          revid: revision,
          text: "<p>Rendered fixture</p>",
        },
      });
    };
    const provider = new RuneScapeWikiTrainingProvider({
      httpClient: new ResilientHttpClient({
        userAgent: "test",
        retries: 0,
        fetchImplementation,
      }),
      now: () => new Date(CHECKED_AT),
    });
    const snapshot = await provider.fetchSnapshot();
    expect(new Set(snapshot.methods.map((method) => method.skillId)).size).toBe(29);
    expect(snapshot.methods.length).toBeGreaterThanOrEqual(58);
    expect(snapshot.sourceRevision).toMatch(/^[a-f0-9]{64}$/);
  });
});
