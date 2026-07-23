import { createHash } from "node:crypto";

import { CompanionError, type TrainingMethodProvider } from "@gielinor/core";
import {
  SKILL_IDS,
  TrainingDataSnapshotSchema,
  TrainingMethodSchema,
  type SkillId,
  type TrainingMethod,
} from "@gielinor/shared-types";
import { z } from "zod";

import { ProviderError, type ResilientHttpClient } from "./http.js";

const WIKI_NAME = "RuneScape Wiki";
const DEFAULT_API_URL = "https://runescape.wiki/api.php";
const DEFAULT_PAGE_URL = "https://runescape.wiki/w/";

export type WikiTrainingProviderOptions = {
  httpClient: ResilientHttpClient;
  apiUrl?: string;
  pageUrl?: string;
  now?: () => Date;
};

type TrainingPage = {
  title: string;
  skills: readonly SkillId[];
};

export const TRAINING_PAGES: readonly TrainingPage[] = [
  {
    title: "Pay-to-play melee training",
    skills: ["attack", "defence", "strength", "constitution"],
  },
  { title: "Pay-to-play Ranged training", skills: ["ranged"] },
  { title: "Pay-to-play Prayer training", skills: ["prayer"] },
  { title: "Pay-to-play Magic training", skills: ["magic"] },
  { title: "Pay-to-play Cooking training", skills: ["cooking"] },
  { title: "Pay-to-play Woodcutting training", skills: ["woodcutting"] },
  { title: "Pay-to-play Fletching training", skills: ["fletching"] },
  { title: "Pay-to-play Fishing training", skills: ["fishing"] },
  { title: "Pay-to-play Firemaking training", skills: ["firemaking"] },
  { title: "Pay-to-play Crafting training", skills: ["crafting"] },
  { title: "Pay-to-play Smithing training", skills: ["smithing"] },
  { title: "Pay-to-play Mining training", skills: ["mining"] },
  { title: "Pay-to-play Herblore training", skills: ["herblore"] },
  { title: "Pay-to-play Agility training", skills: ["agility"] },
  { title: "Pay-to-play Thieving training", skills: ["thieving"] },
  { title: "Pay-to-play Slayer training", skills: ["slayer"] },
  { title: "Pay-to-play Farming training", skills: ["farming"] },
  { title: "Pay-to-play Runecrafting training", skills: ["runecrafting"] },
  { title: "Pay-to-play Hunter training", skills: ["hunter"] },
  { title: "Pay-to-play Construction training", skills: ["construction"] },
  { title: "Pay-to-play Summoning training", skills: ["summoning"] },
  { title: "Pay-to-play Dungeoneering training", skills: ["dungeoneering"] },
  { title: "Pay-to-play Divination training", skills: ["divination"] },
  { title: "Invention training", skills: ["invention"] },
  { title: "Pay-to-play Archaeology training", skills: ["archaeology"] },
  { title: "Pay-to-play Necromancy training", skills: ["necromancy"] },
] as const;

const RevisionResponseSchema = z
  .object({
    query: z
      .object({
        redirects: z
          .array(
            z
              .object({
                from: z.string(),
                to: z.string(),
              })
              .passthrough(),
          )
          .optional(),
        pages: z.array(
          z
            .object({
              title: z.string(),
              missing: z.boolean().optional(),
              revisions: z
                .array(
                  z.object({
                    revid: z.number().int().positive(),
                    timestamp: z.string().datetime({ offset: true }),
                    slots: z.object({
                      main: z.object({ content: z.string() }).passthrough(),
                    }),
                  }),
                )
                .optional(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

const ParseResponseSchema = z
  .object({
    parse: z
      .object({
        title: z.string(),
        revid: z.number().int().positive(),
        text: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

type Revision = {
  title: string;
  revisionId: number;
  timestamp: string;
  content: string;
};

type ParsedMethod = {
  name: string;
  minimumLevel: number;
  maximumLevel?: number | undefined;
  xpPerHourRange?: { minimum: number; maximum: number } | undefined;
  gpPerHourRange?: { minimum: number; maximum: number } | undefined;
  confidence: "low" | "medium" | "high";
  uncertaintyNotes: string[];
  context: string;
};

function malformed(message: string, cause?: unknown): CompanionError {
  return new CompanionError(message, "MALFORMED_TRAINING_DATA", { cause });
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pageKey(value: string): string {
  return value.replaceAll("_", " ").trim().toLocaleLowerCase();
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#x([a-f0-9]+);/gi, (_, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

export function cleanTrainingWikiText(value: string): string {
  let cleaned = value;
  cleaned = cleaned.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ");
  cleaned = cleaned.replace(/<ref\b[^>]*\/>/gi, " ");
  cleaned = cleaned.replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, " ");
  cleaned = cleaned.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1");
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, "$1");
  cleaned = cleaned.replace(/\{\{(?:nowrap|plainlist|small|abbr)\|([^{}]+)\}\}/gi, "$1");
  cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, " ");
  cleaned = cleaned.replace(/'{2,}/g, "");
  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  cleaned = decodeEntities(cleaned);
  return cleaned.replace(/\s+/g, " ").trim();
}

function numericRate(value: string): number | undefined {
  const normalized = value.trim().toLocaleLowerCase().replaceAll(",", "").replace(/\s+/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  const rate = amount * multiplier;
  return Number.isFinite(rate) && rate > 0 ? Math.round(rate) : undefined;
}

function parseSignedValues(value: string): number[] {
  const cleaned = cleanTrainingWikiText(value).replaceAll("−", "-");
  return [...cleaned.matchAll(/(?<![\d.])(-?\d[\d,]*(?:\.\d+)?[km]?)(?![A-Za-z])/gi)]
    .map((match) => {
      const token = match[1] ?? "";
      const negative = token.startsWith("-");
      const amount = numericRate(token.replace(/^-/, ""));
      return amount === undefined ? undefined : negative ? -amount : amount;
    })
    .filter((candidate): candidate is number => candidate !== undefined);
}

export function parseTrainingRate(value: string): {
  minimum: number;
  maximum: number;
  openEnded: boolean;
} | null {
  const cleaned = cleanTrainingWikiText(value);
  const matches = [...cleaned.matchAll(/(?<![\d.])(\d[\d,]*(?:\.\d+)?[km]?)(?![A-Za-z])/gi)];
  const values = matches
    .map((match) => numericRate(match[1] ?? ""))
    .filter((candidate): candidate is number => candidate !== undefined && candidate <= 50_000_000);
  if (values.length === 0) {
    return null;
  }
  const openEnded = /\+/.test(cleaned);
  const first = values[0] as number;
  const second = values[1];
  return {
    minimum: Math.min(first, second ?? first),
    maximum: Math.max(first, second ?? first),
    openEnded,
  };
}

export function parseTrainingLevelRange(value: string): {
  minimumLevel: number;
  maximumLevel?: number | undefined;
} | null {
  const cleaned = cleanTrainingWikiText(value)
    .replace(/^levels?\s*/i, "")
    .replace(/[−–—]/g, "-");
  const range = cleaned.match(/(\d{1,3})\s*-\s*(\d{1,3})(\+)?/);
  if (range !== null) {
    const minimumLevel = Number(range[1]);
    const maximumLevel = Number(range[2]);
    if (
      minimumLevel >= 1 &&
      minimumLevel <= 120 &&
      maximumLevel >= minimumLevel &&
      maximumLevel <= 150
    ) {
      return { minimumLevel, maximumLevel };
    }
    return null;
  }
  const open = cleaned.match(/(\d{1,3})\s*\+/);
  if (open !== null) {
    const minimumLevel = Number(open[1]);
    return minimumLevel >= 1 && minimumLevel <= 120 ? { minimumLevel } : null;
  }
  const single = cleaned.match(/^(\d{1,3})$/);
  if (single !== null) {
    const minimumLevel = Number(single[1]);
    return minimumLevel >= 1 && minimumLevel <= 120 ? { minimumLevel } : null;
  }
  return null;
}

export function trainingTableBlocks(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split(/\r?\n/);
  let depth = 0;
  let current: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith("{|")) {
      if (depth === 0) {
        current = [];
      }
      depth += 1;
    }
    if (depth > 0) {
      current.push(line);
    }
    if (line.trimStart().startsWith("|}") && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        blocks.push(current.join("\n"));
      }
    }
  }
  return blocks;
}

export function trainingTableCells(row: string): string[] {
  const cells: string[] = [];
  for (const rawLine of row.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || line.startsWith("|-") || line.startsWith("|}")) {
      continue;
    }
    const values = line.slice(1).split("||");
    for (const rawValue of values) {
      const attributeSeparator = rawValue.indexOf("|");
      const value =
        attributeSeparator >= 0 &&
        /(?:style|class|rowspan|colspan|data-sort-value)\s*=/i.test(
          rawValue.slice(0, attributeSeparator),
        )
          ? rawValue.slice(attributeSeparator + 1)
          : rawValue;
      cells.push(value.trim());
    }
  }
  return cells;
}

export function parseTrainingSummaryTables(content: string): ParsedMethod[] {
  const methods: ParsedMethod[] = [];
  for (const table of trainingTableBlocks(content)) {
    const header = table
      .split(/\r?\n/)
      .filter((line) => line.trimStart().startsWith("!"))
      .slice(0, 8)
      .join(" ");
    if (
      !/\blevels?\b/i.test(header) ||
      !/\bmethod\b|\baction\b|\bactivity\b/i.test(header) ||
      !/(?:experience|xp)\s*(?:per|\/)\s*hour/i.test(cleanTrainingWikiText(header))
    ) {
      continue;
    }
    const rows = table.split(/^\|-[^\r\n]*$/m).slice(1);
    for (const row of rows) {
      const cells = trainingTableCells(row);
      if (cells.length < 3) {
        continue;
      }
      const levels = parseTrainingLevelRange(cells[0] ?? "");
      const rate = parseTrainingRate(cells.at(-1) ?? "");
      const name = cleanTrainingWikiText(cells[1] ?? "");
      if (levels === null || rate === null || name.length === 0) {
        continue;
      }
      methods.push({
        name,
        ...levels,
        xpPerHourRange: { minimum: rate.minimum, maximum: rate.maximum },
        confidence: "high",
        uncertaintyNotes: [
          "Published rates are estimates and vary with equipment, boosts, attention, and player execution.",
          ...(rate.openEnded ? ["The source marks this rate as open-ended with a plus sign."] : []),
        ],
        context: row,
      });
    }
  }
  return methods;
}

type HtmlCell = {
  tag: "th" | "td";
  text: string;
  colspan: number;
  rowspan: number;
};

function htmlText(value: string): string {
  return decodeEntities(
    value
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|li|div)>/gi, " ")
      .replace(/<img\b[^>]*\balt=(?:"([^"]*)"|'([^']*)')[^>]*>/gi, " $1$2 ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTableRows(table: string): HtmlCell[][] {
  const rawRows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (match) => match[1] ?? "",
  );
  const rows: HtmlCell[][] = [];
  const active = new Map<number, { cell: HtmlCell; remaining: number }>();
  for (const rawRow of rawRows) {
    const row: HtmlCell[] = [];
    for (const [column, carried] of [...active]) {
      row[column] = carried.cell;
      carried.remaining -= 1;
      if (carried.remaining <= 0) {
        active.delete(column);
      }
    }
    const cells = [...rawRow.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
    let column = 0;
    for (const match of cells) {
      while (row[column] !== undefined) {
        column += 1;
      }
      const attributes = match[2] ?? "";
      const colspan = Math.max(
        1,
        Number(attributes.match(/\bcolspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1),
      );
      const rowspan = Math.max(
        1,
        Number(attributes.match(/\browspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1),
      );
      const cell: HtmlCell = {
        tag: (match[1]?.toLocaleLowerCase() ?? "td") as "th" | "td",
        text: htmlText(match[3] ?? ""),
        colspan,
        rowspan,
      };
      for (let span = 0; span < colspan; span += 1) {
        while (row[column] !== undefined) {
          column += 1;
        }
        row[column] = cell;
        if (rowspan > 1) {
          active.set(column, { cell, remaining: rowspan - 1 });
        }
        column += 1;
      }
    }
    if (row.length > 0) {
      rows.push(row);
    }
  }
  return rows;
}

function renderedTableBlocks(html: string): string[] {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((match) => match[0]);
}

function headerLabels(rows: readonly HtmlCell[][], dataStart: number): string[] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: width }, (_, column) => {
    const labels: string[] = [];
    for (let row = 0; row < dataStart; row += 1) {
      const cell = rows[row]?.[column];
      if (cell?.tag === "th" && cell.text.length > 0 && !labels.includes(cell.text)) {
        labels.push(cell.text);
      }
    }
    return labels.join(" ");
  });
}

function chooseMethodName(
  row: readonly HtmlCell[],
  methodIndex: number | undefined,
  levelIndex: number | undefined,
  xpIndexes: readonly number[],
): string {
  const preferred = methodIndex === undefined ? "" : (row[methodIndex]?.text ?? "");
  if (preferred.length > 0 && !/^(?:n\/a|none|-)$/.test(preferred.toLocaleLowerCase())) {
    return preferred;
  }
  for (const [index, cell] of row.entries()) {
    if (
      index !== levelIndex &&
      !xpIndexes.includes(index) &&
      cell.text.length > 2 &&
      /[A-Za-z]/.test(cell.text) &&
      !/^(?:n\/a|none|varies|-)$/.test(cell.text.toLocaleLowerCase())
    ) {
      return cell.text;
    }
  }
  return "";
}

function normalizeMethodName(value: string): string {
  const cleaned = value
    .replace(/^.*?\.png:\s*RS3 Inventory image of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ");
  if (words.length % 2 === 0) {
    const midpoint = words.length / 2;
    const left = words.slice(0, midpoint).join(" ");
    const right = words.slice(midpoint).join(" ");
    if (left.toLocaleLowerCase() === right.toLocaleLowerCase()) {
      return left;
    }
  }
  return cleaned;
}

function normalizeSourceMethodName(value: string): string {
  const normalized = normalizeMethodName(value);
  const withoutLevelPrefix = normalized.replace(
    /^Levels?\s+\d{1,3}(?:\s*[-–—]\s*\d{1,3})?\+?\s*:\s*/i,
    "",
  );
  return withoutLevelPrefix.length > 0 ? withoutLevelPrefix : normalized;
}

export function parseRenderedTrainingTables(html: string): ParsedMethod[] {
  const methods: ParsedMethod[] = [];
  for (const table of renderedTableBlocks(html)) {
    const rows = htmlTableRows(table);
    const dataStart = rows.findIndex((row) => row.some((cell) => cell.tag === "td"));
    if (dataStart < 1) {
      continue;
    }
    const headers = headerLabels(rows, dataStart);
    const xpIndexes = headers
      .map((header, index) => ({ header, index }))
      .filter(
        ({ header }) =>
          /(?:experience|xp).*(?:per\s*hour|\/\s*h(?:ou)?r)|(?:per\s*hour|\/\s*h(?:ou)?r).*(?:experience|xp)/i.test(
            header,
          ) && !/(?:profit|coins?|gp)\s*(?:per|\/)\s*(?:experience|xp)/i.test(header),
      )
      .map(({ index }) => index);
    if (xpIndexes.length === 0) {
      continue;
    }
    const levelIndex = headers.findIndex((header) =>
      /^(?:.*\s)?(?:levels?|req\.?|slayer lvl|viable levels)(?:\s.*)?$/i.test(header),
    );
    const foundMethodIndex = headers.findIndex((header) =>
      /\b(?:method|food|item|task|monster|activity|action|gem|armour type|product)\b/i.test(header),
    );
    const methodIndex = foundMethodIndex < 0 ? undefined : foundMethodIndex;
    const gpPerHourIndexes = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) =>
        /(?:profit|loss|coins?|gp).*(?:per\s*hour|\/\s*h(?:ou)?r)|(?:per\s*hour|\/\s*h(?:ou)?r).*(?:profit|loss|coins?|gp)/i.test(
          header,
        ),
      )
      .map(({ index }) => index);
    const parsedRows: ParsedMethod[] = [];
    for (const row of rows.slice(dataStart)) {
      if (!row.some((cell) => cell.tag === "td")) {
        continue;
      }
      const levels =
        levelIndex < 0 ? { minimumLevel: 1 } : parseTrainingLevelRange(row[levelIndex]?.text ?? "");
      if (levels === null) {
        continue;
      }
      const rates = xpIndexes
        .map((index) => parseTrainingRate(row[index]?.text ?? ""))
        .filter((rate): rate is NonNullable<typeof rate> => rate !== null)
        .filter((rate) => rate.maximum >= 100);
      if (rates.length === 0) {
        continue;
      }
      const name = normalizeMethodName(
        chooseMethodName(row, methodIndex, levelIndex < 0 ? undefined : levelIndex, xpIndexes),
      );
      if (name.length === 0) {
        continue;
      }
      const gpValues = gpPerHourIndexes.flatMap((index) =>
        parseSignedValues(row[index]?.text ?? ""),
      );
      parsedRows.push({
        name,
        ...levels,
        xpPerHourRange: {
          minimum: Math.min(...rates.map((rate) => rate.minimum)),
          maximum: Math.max(...rates.map((rate) => rate.maximum)),
        },
        ...(gpValues.length === 0
          ? {}
          : {
              gpPerHourRange: {
                minimum: Math.min(...gpValues),
                maximum: Math.max(...gpValues),
              },
            }),
        confidence: "high",
        uncertaintyNotes: [
          "The rendered source publishes multiple equipment or boost scenarios; the range spans the usable values in that row.",
          "Published rates are estimates and vary with equipment, boosts, attention, and player execution.",
          ...(rates.some((rate) => rate.openEnded)
            ? ["The source marks at least one rate as open-ended."]
            : []),
        ],
        context: row.map((cell) => cell.text).join(" | "),
      });
    }
    for (const [index, method] of parsedRows.entries()) {
      const next = parsedRows[index + 1];
      if (
        method.maximumLevel === undefined &&
        next !== undefined &&
        next.minimumLevel > method.minimumLevel
      ) {
        method.maximumLevel = next.minimumLevel;
      }
      methods.push(method);
    }
  }
  return methods;
}

function parseRenderedLevelSections(html: string): ParsedMethod[] {
  const methods: ParsedMethod[] = [];
  const headingPattern = /<h([2-5])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [...html.matchAll(headingPattern)];
  for (const [index, heading] of headings.entries()) {
    const headingText = htmlText(heading[2] ?? "");
    const levelMatch = headingText
      .replace(/[−–—]/g, "-")
      .match(/(?:Levels?|Level)\s+(\d{1,3})(?:\s*-\s*(\d{1,3}))?(\+)?\s*:?\s*(.*)/i);
    if (levelMatch === null) {
      continue;
    }
    const minimumLevel = Number(levelMatch[1]);
    const maximumLevel = levelMatch[2] === undefined ? undefined : Number(levelMatch[2]);
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const section = html.slice(start, end);
    const rate = sectionRate(section);
    const name = (levelMatch[4] ?? "").replace(/\s*\[edit\]\s*$/i, "").trim();
    if (
      rate === null ||
      name.length === 0 ||
      minimumLevel < 1 ||
      minimumLevel > 120 ||
      (maximumLevel !== undefined && (maximumLevel < minimumLevel || maximumLevel > 150))
    ) {
      continue;
    }
    methods.push({
      name,
      minimumLevel,
      ...(maximumLevel === undefined ? {} : { maximumLevel }),
      xpPerHourRange: { minimum: rate.minimum, maximum: rate.maximum },
      confidence: "medium",
      uncertaintyNotes: [
        "The rate was extracted from the rendered method section rather than a summary table.",
        "Published rates are estimates and vary with equipment, boosts, attention, and player execution.",
      ],
      context: `${headingText}\n${htmlText(section)}`,
    });
  }
  return methods;
}

function parseGenericRenderedSections(html: string): ParsedMethod[] {
  const methods: ParsedMethod[] = [];
  const headings = [...html.matchAll(/<h([2-5])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const ignored =
    /^(?:contents|references|useful items?|useful equipment|generic experience boosts|quests?\b|money making\b)/i;
  for (const [index, heading] of headings.entries()) {
    const name = htmlText(heading[2] ?? "")
      .replace(/\s*\[edit\]\s*$/i, "")
      .trim();
    if (name.length < 3 || ignored.test(name)) {
      continue;
    }
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const sectionHtml = html.slice(start, end);
    const section = htmlText(sectionHtml);
    const rate = sectionRate(section);
    if (rate === null || rate.minimum < 10_000) {
      continue;
    }
    const headingRange =
      parseTrainingLevelRange(name.replace(/^starting\s+up\s*\(/i, "").replace(/\)$/i, "")) ??
      parseTrainingLevelRange(name.replace(/^.*?\blevels?\s+/i, "")) ??
      (() => {
        const requirement = section.match(
          /(?:starting at|from|requires?|at least)\s+(?:level\s+)?(\d{1,3})\b/i,
        );
        const minimumLevel = Number(requirement?.[1] ?? 1);
        return minimumLevel >= 1 && minimumLevel <= 120 ? { minimumLevel } : null;
      })();
    if (headingRange === null) {
      continue;
    }
    methods.push({
      name,
      ...headingRange,
      xpPerHourRange: { minimum: rate.minimum, maximum: rate.maximum },
      confidence: "medium",
      uncertaintyNotes: [
        "The rate was extracted from a named guide section that does not publish a standard summary row.",
        "Published rates are estimates and vary with equipment, boosts, attention, and player execution.",
      ],
      context: `${name}\n${section}`,
    });
  }
  return methods;
}

function fallbackGuideMethod(revision: Revision): ParsedMethod {
  return {
    name: revision.title.replace(/^Pay-to-play\s+/i, "").replace(/\s+training$/i, ""),
    minimumLevel: 1,
    confidence: "low",
    uncertaintyNotes: [
      "The source guide does not publish a safely extractable hourly rate for this method.",
      "Time and cost estimates are unavailable until a numeric, source-backed rate is synchronized.",
    ],
    context: revision.content.slice(0, 2_000),
  };
}

function sectionRate(section: string): ReturnType<typeof parseTrainingRate> {
  const plain = cleanTrainingWikiText(section);
  const patterns = [
    /(?:between\s+)?(\d[\d,.]*[km]?\s*(?:(?:-|–|—|to)\s*\d[\d,.]*[km]?)?\+?)(?=.{0,45}(?:experience|xp).{0,30}(?:per|an)\s+hour)/gi,
    /(?:experience|xp)\s+rates?\s+(?:of|between|around|up to|at least)?\s*(\d[\d,.]*[km]?\s*(?:(?:-|–|—|to)\s*\d[\d,.]*[km]?)?\+?)(?=.{0,25}(?:per|an)\s+hour)/gi,
  ];
  for (const pattern of patterns) {
    const matches = [...plain.matchAll(pattern)];
    const candidate = matches.at(-1)?.[1];
    if (candidate !== undefined) {
      const rate = parseTrainingRate(candidate);
      if (rate !== null && rate.minimum >= 100) {
        return rate;
      }
    }
  }
  return null;
}

function parseLevelSections(content: string): ParsedMethod[] {
  const methods: ParsedMethod[] = [];
  const headingPattern =
    /^(={3,5})\s*(?:Levels?|Level)\s+(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(\+)?\s*:?\s*([^=\n]*?)\s*\1\s*$/gim;
  const headings = [...content.matchAll(headingPattern)];
  for (const [index, match] of headings.entries()) {
    const minimumLevel = Number(match[2]);
    const end = match[3] === undefined ? undefined : Number(match[3]);
    const headingEnd = (match.index ?? 0) + match[0].length;
    const nextHeading = content.slice(headingEnd).search(/^={2,5}[^=].*?={2,5}\s*$/m);
    const section = content.slice(
      headingEnd,
      nextHeading < 0 ? undefined : headingEnd + nextHeading,
    );
    const rate = sectionRate(section);
    if (
      !Number.isInteger(minimumLevel) ||
      minimumLevel < 1 ||
      minimumLevel > 120 ||
      (end !== undefined && (end < minimumLevel || end > 150)) ||
      rate === null
    ) {
      continue;
    }
    const name = cleanTrainingWikiText(match[5] ?? "");
    if (name.length === 0) {
      continue;
    }
    methods.push({
      name,
      minimumLevel,
      ...(end === undefined ? {} : { maximumLevel: end }),
      xpPerHourRange: { minimum: rate.minimum, maximum: rate.maximum },
      confidence: "medium",
      uncertaintyNotes: [
        "The rate was extracted from the method's level-range section rather than a summary table.",
        "Published rates are estimates and vary with equipment, boosts, attention, and player execution.",
        ...(rate.openEnded ? ["The source marks this rate as open-ended with a plus sign."] : []),
      ],
      context: `${match[0]}\n${section}`,
    });
    void index;
  }
  return methods;
}

function questRequirements(context: string): string[] {
  const quests = new Map<string, string>();
  const patterns = [
    /(?:completion of|completed|complete|during or after)\s+(?:the\s+quest\s+)?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gi,
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]\s+quest/gi,
  ];
  for (const pattern of patterns) {
    for (const match of context.matchAll(pattern)) {
      const name = cleanTrainingWikiText(match[1] ?? "");
      if (name.length > 0) {
        quests.set(name.toLocaleLowerCase(), name);
      }
    }
  }
  return [...quests.values()].sort((left, right) => left.localeCompare(right));
}

function methodAttention(context: string): {
  intensity: "low" | "medium" | "high";
  afkRating: "not-afk" | "low" | "moderate" | "high";
} {
  const text = cleanTrainingWikiText(context).toLocaleLowerCase();
  if (/\bfully afk\b|\bcompletely afk\b|\bexcellent (?:choice )?for afk\b/.test(text)) {
    return { intensity: "low", afkRating: "high" };
  }
  if (/\bafk\b|\blow intensity\b|\blow-intensity\b|\baway from keyboard\b/.test(text)) {
    return { intensity: "low", afkRating: "moderate" };
  }
  if (/\bclick-intensive\b|\bhigh intensity\b|\bhigh-intensity\b|\bactive method\b/.test(text)) {
    return { intensity: "high", afkRating: "not-afk" };
  }
  return { intensity: "medium", afkRating: "low" };
}

function pageUrl(base: string, title: string): string {
  return new URL(encodeURIComponent(title.replaceAll(" ", "_")), base).toString();
}

export function parseTrainingGuide(
  revision: Revision,
  skills: readonly SkillId[],
  checkedAt: string,
  wikiPageUrl = DEFAULT_PAGE_URL,
  renderedHtml?: string,
): TrainingMethod[] {
  const raw = [
    ...parseTrainingSummaryTables(revision.content),
    ...parseLevelSections(revision.content),
    ...(renderedHtml === undefined ? [] : parseRenderedTrainingTables(renderedHtml)),
    ...(renderedHtml === undefined ? [] : parseRenderedLevelSections(renderedHtml)),
    ...(renderedHtml === undefined ? [] : parseGenericRenderedSections(renderedHtml)),
  ];
  if (raw.length === 0) {
    raw.push(fallbackGuideMethod(revision));
  }
  const methods: TrainingMethod[] = [];
  const used = new Set<string>();
  for (const skillId of skills) {
    for (const parsed of raw) {
      const name = normalizeSourceMethodName(parsed.name);
      if (!/[A-Za-z0-9]/.test(name)) {
        continue;
      }
      const identity = `${skillId}:${parsed.minimumLevel}:${parsed.maximumLevel ?? "plus"}:${slug(name)}`;
      if (used.has(identity)) {
        continue;
      }
      used.add(identity);
      const attention = methodAttention(parsed.context);
      const sourceUrl = pageUrl(wikiPageUrl, revision.title);
      const base = {
        id: identity,
        name,
        skillId,
        minimumLevel: parsed.minimumLevel,
        ...(parsed.maximumLevel === undefined ? {} : { maximumLevel: parsed.maximumLevel }),
        ...(parsed.xpPerHourRange === undefined
          ? {}
          : {
              xpPerHour: parsed.xpPerHourRange.maximum,
              xpPerHourRange: parsed.xpPerHourRange,
            }),
        ...(parsed.gpPerHourRange === undefined ? {} : { gpPerHourRange: parsed.gpPerHourRange }),
        ...attention,
        members: true,
        ironmanCompatibility: "unknown" as const,
        requirements: [],
        questRequirements: questRequirements(parsed.context),
        itemRequirements: [],
        equipment: [],
        notes: [],
        confidence: parsed.confidence,
        uncertaintyNotes: parsed.uncertaintyNotes,
        sourceName: WIKI_NAME,
        sourceUrl,
        sourceRevision: String(revision.revisionId),
        sourceUpdatedAt: revision.timestamp,
        lastCheckedAt: checkedAt,
      };
      methods.push(
        TrainingMethodSchema.parse({
          ...base,
          contentHash: stableHash({
            ...base,
            sourceRevision: undefined,
            sourceUpdatedAt: undefined,
            lastCheckedAt: undefined,
          }),
        }),
      );
    }
  }
  return methods;
}

async function responseJson(httpClient: ResilientHttpClient, url: URL): Promise<unknown> {
  const response = await httpClient.get(url);
  try {
    return await response.json();
  } catch (error) {
    throw malformed("RuneScape Wiki returned invalid JSON", error);
  }
}

function apiUrl(base: string, parameters: Record<string, string>): URL {
  const url = new URL(base);
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  return url;
}

async function loadRevisions(
  httpClient: ResilientHttpClient,
  endpoint: string,
  titles: readonly string[],
): Promise<Map<string, Revision>> {
  const payload = await responseJson(
    httpClient,
    apiUrl(endpoint, {
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      redirects: "1",
      titles: titles.join("|"),
    }),
  );
  let parsed: z.infer<typeof RevisionResponseSchema>;
  try {
    parsed = RevisionResponseSchema.parse(payload);
  } catch (error) {
    throw malformed("RuneScape Wiki training revision response failed validation", error);
  }
  const redirects = new Map(
    (parsed.query.redirects ?? []).map((redirect) => [pageKey(redirect.from), redirect.to]),
  );
  const revisions = new Map<string, Revision>();
  for (const page of parsed.query.pages) {
    const revision = page.revisions?.[0];
    if (page.missing === true || revision === undefined) {
      continue;
    }
    const value = {
      title: page.title,
      revisionId: revision.revid,
      timestamp: revision.timestamp,
      content: revision.slots.main.content,
    };
    revisions.set(pageKey(page.title), value);
    for (const [from, to] of redirects) {
      if (pageKey(to) === pageKey(page.title)) {
        revisions.set(from, value);
      }
    }
  }
  return revisions;
}

async function loadRenderedPages(
  httpClient: ResilientHttpClient,
  endpoint: string,
  revisions: readonly Revision[],
): Promise<Map<number, string>> {
  const rendered = new Map<number, string>();
  for (let offset = 0; offset < revisions.length; offset += 5) {
    const batch = revisions.slice(offset, offset + 5);
    const responses = await Promise.all(
      batch.map(async (revision) => {
        const payload = await responseJson(
          httpClient,
          apiUrl(endpoint, {
            action: "parse",
            format: "json",
            formatversion: "2",
            oldid: String(revision.revisionId),
            prop: "text",
          }),
        );
        try {
          return ParseResponseSchema.parse(payload).parse;
        } catch (error) {
          throw malformed(`Rendered training page failed validation for ${revision.title}`, error);
        }
      }),
    );
    for (const response of responses) {
      rendered.set(response.revid, response.text);
    }
  }
  return rendered;
}

export class RuneScapeWikiTrainingProvider implements TrainingMethodProvider {
  private readonly apiEndpoint: string;
  private readonly pageEndpoint: string;
  private readonly now: () => Date;

  public constructor(private readonly options: WikiTrainingProviderOptions) {
    this.apiEndpoint = options.apiUrl ?? DEFAULT_API_URL;
    this.pageEndpoint = options.pageUrl ?? DEFAULT_PAGE_URL;
    this.now = options.now ?? (() => new Date());
  }

  public async fetchSnapshot() {
    const revisions = await loadRevisions(
      this.options.httpClient,
      this.apiEndpoint,
      TRAINING_PAGES.map((page) => page.title),
    );
    const uniqueRevisions = [...new Set(revisions.values())];
    const renderedPages = await loadRenderedPages(
      this.options.httpClient,
      this.apiEndpoint,
      uniqueRevisions,
    );
    const checkedAt = this.now().toISOString();
    const methods: TrainingMethod[] = [];
    for (const page of TRAINING_PAGES) {
      const revision = revisions.get(pageKey(page.title));
      if (revision === undefined) {
        throw malformed(`RuneScape Wiki revision was missing for ${page.title}`);
      }
      methods.push(
        ...parseTrainingGuide(
          revision,
          page.skills,
          checkedAt,
          this.pageEndpoint,
          renderedPages.get(revision.revisionId),
        ),
      );
    }
    if (methods.length === 0) {
      throw new ProviderError(
        "RuneScape Wiki returned no usable training methods; the previous snapshot was retained",
        "EMPTY_PROVIDER_RESPONSE",
        true,
      );
    }
    const coveredSkills = new Set(methods.map((method) => method.skillId));
    const missingSkills = SKILL_IDS.filter((skillId) => !coveredSkills.has(skillId));
    if (missingSkills.length > 0) {
      throw malformed(
        `Training guides produced no usable XP rates for: ${missingSkills.join(", ")}`,
      );
    }
    const unique = new Map<string, TrainingMethod>();
    for (const method of methods) {
      if (unique.has(method.id)) {
        throw malformed(`RuneScape Wiki produced duplicate training method ID ${method.id}`);
      }
      unique.set(method.id, method);
    }
    const revisionDigest = stableHash(
      uniqueRevisions
        .map((revision) => [revision.title, revision.revisionId])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
    return TrainingDataSnapshotSchema.parse({
      provider: WIKI_NAME,
      sourceUrl: pageUrl(this.pageEndpoint, "Training"),
      sourceRevision: revisionDigest,
      retrievedAt: checkedAt,
      methods: [...unique.values()].sort(
        (left, right) =>
          SKILL_IDS.indexOf(left.skillId) - SKILL_IDS.indexOf(right.skillId) ||
          left.minimumLevel - right.minimumLevel ||
          left.name.localeCompare(right.name),
      ),
    });
  }
}
