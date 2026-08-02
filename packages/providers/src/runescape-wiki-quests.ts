import { createHash } from "node:crypto";

import type { QuestDataProvider } from "@gielinor/core";
import {
  QuestDataSnapshotSchema,
  QuestCoverageReportSchema,
  QuestSchema,
  SKILL_IDS,
  SkillIdSchema,
  type Quest,
  type QuestItemRequirement,
  type QuestPrerequisite,
  type QuestReward,
  type SkillRequirement,
} from "@gielinor/shared-types";
import { z } from "zod";

import { ProviderError, type ResilientHttpClient } from "./http.js";

const WIKI_NAME = "RuneScape Wiki";
const DEFAULT_API_URL = "https://runescape.wiki/api.php";
const DEFAULT_PAGE_URL = "https://runescape.wiki/w/";
const QUESTREQ_PAGE = "Module:Questreq/data";

const optionalText = z.string().min(1).nullable().optional();
const repeatedText = z.union([z.string().min(1), z.array(z.string().min(1))]).optional();

const BucketQuestRowSchema = z
  .object({
    page_name: z.string().min(1),
    page_name_sub: z.string().min(1),
    json: z.string().min(2),
    official_length: optionalText,
    requirements: optionalText,
    requirement_skill: repeatedText,
    requirement_skill_level: repeatedText,
  })
  .strict();

const BucketRewardRowSchema = z
  .object({
    page_name: z.string().min(1),
    page_name_sub: z.string().min(1),
    quest_points: z.number().int().nonnegative().nullable().optional(),
    rewards: optionalText,
    post_rewards: optionalText,
    music: optionalText,
  })
  .strict();

const BucketInfoboxRowSchema = z
  .object({
    page_name: z.string().min(1),
    page_name_sub: z.string().min(1),
    name: optionalText,
    is_members_only: z.boolean().nullable().optional(),
    official_difficulty: optionalText,
    official_combat: optionalText,
    official_series: optionalText,
    official_nth_in_series: optionalText,
    quest_type: optionalText,
    id: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

const QuestDetailsJsonSchema = z
  .object({
    name: z.string().min(1).optional(),
    members: z.string().min(1).optional(),
    length: z.string().min(1).optional(),
    requirements: z.string().optional(),
    items: z.string().optional(),
    recommended: z.string().optional(),
    ironman: z.string().optional(),
    start: z.string().optional(),
    kills: z.string().optional(),
  })
  .passthrough();

const RevisionSchema = z
  .object({
    revid: z.number().int().positive(),
    timestamp: z.string().datetime({ offset: true }),
    slots: z
      .object({
        main: z
          .object({
            content: z.string(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const RevisionPageSchema = z
  .object({
    pageid: z.number().int().positive(),
    title: z.string().min(1),
    revisions: z.array(RevisionSchema).min(1),
  })
  .passthrough();

const RevisionsResponseSchema = z
  .object({
    query: z
      .object({
        pages: z.array(RevisionPageSchema),
      })
      .passthrough(),
  })
  .passthrough();

type BucketQuestRow = z.infer<typeof BucketQuestRowSchema>;
type BucketRewardRow = z.infer<typeof BucketRewardRowSchema>;

type PageRevision = {
  revisionId: number;
  timestamp: string;
  content: string;
};

export type WikiQuestProviderOptions = {
  httpClient: ResilientHttpClient;
  apiUrl?: string;
  pageUrl?: string;
  now?: () => Date;
};

function malformed(message: string, cause?: unknown): ProviderError {
  return new ProviderError(message, "MALFORMED_PROVIDER_RESPONSE", false, {
    ...(cause === undefined ? {} : { cause }),
  });
}

function asTextArray(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function canonicalQuestId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function cleanWikiText(value: string): string {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[File:[^\]]+\]\]/gi, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function topLevelBullets(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .filter((line) => /^\*\s+/.test(line))
    .map((line) => line.replace(/^\*\s+/, "").trim())
    .filter((line) => line.length > 0 && !/^none$/i.test(cleanWikiText(line)));
}

function wikiLinks(value: string): string[] {
  const links: string[] = [];
  for (const match of value.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)) {
    const target = match[1]?.trim();
    const display = match[2]?.trim();
    if (
      target === undefined ||
      /^(?:File|Category|Update|Quest):/i.test(target) ||
      /-icon\.png$/i.test(target)
    ) {
      continue;
    }
    links.push(cleanWikiText(display ?? target));
  }
  return links;
}

export function parseQuestItems(value: string | undefined): QuestItemRequirement[] {
  return topLevelBullets(value).map((line) => {
    const links = wikiLinks(line);
    const plain = cleanWikiText(line);
    const quantityMatch = plain.match(/^([\d,]+)\b/);
    const quantity = quantityMatch === null ? 1 : Number(quantityMatch[1]?.replaceAll(",", ""));
    const name =
      links[0] ??
      plain
        .replace(/^[\d,]+\s*/, "")
        .split(/\s+(?:or|and)\s+/i)[0]
        ?.trim() ??
      plain;
    const alternatives = /\sor\s/i.test(plain) ? links.slice(1) : [];
    return {
      name: name.length === 0 ? plain : name,
      quantity: Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1,
      ...(alternatives.length === 0 ? {} : { alternatives }),
    };
  });
}

function parseSkillRequirements(row: BucketQuestRow): SkillRequirement[] {
  const requirements = new Map<string, number>();
  for (const value of asTextArray(row.requirement_skill_level)) {
    const separator = value.lastIndexOf(":");
    if (separator <= 0) {
      throw malformed(`Invalid skill requirement "${value}" for ${row.page_name_sub}`);
    }
    const skill = value.slice(0, separator).trim().toLocaleLowerCase();
    const level = Number(value.slice(separator + 1));
    if (skill === "quest points") {
      if (!Number.isInteger(level) || level < 0) {
        throw malformed(`Invalid quest point requirement "${value}" for ${row.page_name_sub}`);
      }
      continue;
    }
    const parsedSkill = SkillIdSchema.safeParse(skill);
    if (!parsedSkill.success || !Number.isInteger(level) || level < 1 || level > 120) {
      throw malformed(`Invalid skill requirement "${value}" for ${row.page_name_sub}`);
    }
    requirements.set(parsedSkill.data, Math.max(requirements.get(parsedSkill.data) ?? 0, level));
  }

  if (requirements.size === 0) {
    const skills = asTextArray(row.requirement_skill).filter(
      (skill) => skill.toLocaleLowerCase() !== "quest points",
    );
    if (skills.length > 0) {
      throw malformed(`Missing skill levels for ${row.page_name_sub}`);
    }
  }
  return [...requirements.entries()]
    .map(([skillId, level]) => ({ skillId: SkillIdSchema.parse(skillId), level }))
    .sort((left, right) => SKILL_IDS.indexOf(left.skillId) - SKILL_IDS.indexOf(right.skillId));
}

function parseQuestPointRequirement(row: BucketQuestRow): number | undefined {
  for (const value of asTextArray(row.requirement_skill_level)) {
    const match = value.match(/^quest points:(\d+)$/i);
    if (match !== null) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function parseOtherRequirements(value: string | null | undefined): string[] {
  return topLevelBullets(value ?? undefined)
    .filter((line) => !/data-skill=/i.test(line))
    .map(cleanWikiText)
    .filter((line) => line.length > 0);
}

function parseRewards(
  row: BucketRewardRow | undefined,
  questPointReward: number | undefined,
): QuestReward[] {
  const rewards: QuestReward[] = [];
  if (questPointReward !== undefined) {
    rewards.push({
      type: "quest-points",
      amount: questPointReward,
      description: `${questPointReward} quest point${questPointReward === 1 ? "" : "s"}`,
    });
  }
  for (const line of topLevelBullets(row?.rewards ?? undefined)) {
    const description = cleanWikiText(line);
    const experience = description.match(/^([\d,]+)(?:\s+([A-Za-z]+))?\s+experience\b/i);
    const iconSkill = line.match(/\[\[File:([A-Za-z]+)-icon\.png/i)?.[1];
    const skill = (iconSkill ?? experience?.[2])?.toLocaleLowerCase();
    const parsedSkill = SkillIdSchema.safeParse(skill);
    const amount = Number(experience?.[1]?.replaceAll(",", ""));
    if (experience !== null && parsedSkill.success && Number.isSafeInteger(amount)) {
      rewards.push({
        type: "experience",
        skillId: parsedSkill.data,
        amount,
        description,
      });
    } else {
      rewards.push({
        type: /\baccess\b|\bability\b|\bpermission\b|\bunlock\b/i.test(description)
          ? "unlock"
          : "other",
        description,
      });
    }
  }
  return rewards;
}

function parseLuaStringList(value: string): string[] {
  const output: string[] = [];
  const matcher = /"((?:\\.|[^"\\])*)"/g;
  for (const match of value.matchAll(matcher)) {
    const raw = match[1] ?? "";
    output.push(raw.replaceAll('\\"', '"').replaceAll("\\\\", "\\").replaceAll("\\n", "\n"));
  }
  return output;
}

export function parseQuestRequirementModule(source: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const entryPattern = /^\s*\["((?:\\.|[^"\\])*)"\]\s*=\s*\{(.*)\},?\s*$/gm;
  for (const match of source.matchAll(entryPattern)) {
    const rawName = match[1];
    const rawValues = match[2];
    if (rawName === undefined || rawValues === undefined) {
      continue;
    }
    const name = rawName.replaceAll('\\"', '"').replaceAll("\\\\", "\\");
    result.set(name, parseLuaStringList(rawValues));
  }
  if (result.size === 0) {
    throw malformed("RuneScape Wiki quest prerequisite module contained no quest entries");
  }
  return result;
}

function parseQuestDetailsJson(row: BucketQuestRow): z.infer<typeof QuestDetailsJsonSchema> {
  try {
    return QuestDetailsJsonSchema.parse(JSON.parse(decodeEntities(row.json)));
  } catch (error) {
    throw malformed(`Invalid quest detail JSON for ${row.page_name_sub}`, error);
  }
}

function pageKey(value: string): string {
  return value.replaceAll("_", " ").trim().toLocaleLowerCase();
}

function uniqueAliases(values: ReadonlyArray<string>, canonicalName: string): string[] {
  const aliases = new Map<string, string>();
  for (const value of values) {
    const cleaned = value.trim();
    if (cleaned.length === 0 || pageKey(cleaned) === pageKey(canonicalName)) {
      continue;
    }
    aliases.set(pageKey(cleaned), cleaned);
  }
  const withoutQuestSuffix = canonicalName.replace(/\s+\(quest\)$/i, "");
  if (withoutQuestSuffix !== canonicalName) {
    aliases.set(pageKey(withoutQuestSuffix), withoutQuestSuffix);
  }
  return [...aliases.values()].sort((left, right) => left.localeCompare(right));
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

async function loadBucket<T>(
  httpClient: ResilientHttpClient,
  endpoint: string,
  query: string,
  rowSchema: z.ZodType<T>,
): Promise<T[]> {
  const payload = await responseJson(
    httpClient,
    apiUrl(endpoint, {
      action: "bucket",
      format: "json",
      formatversion: "2",
      query,
    }),
  );
  const envelope = z
    .object({
      bucket: z.array(z.unknown()).optional(),
      error: z.string().optional(),
    })
    .passthrough()
    .safeParse(payload);
  if (!envelope.success) {
    throw malformed("RuneScape Wiki returned an invalid Bucket response", envelope.error);
  }
  if (envelope.data.error !== undefined) {
    throw malformed(`RuneScape Wiki Bucket query failed: ${envelope.data.error}`);
  }
  if (envelope.data.bucket === undefined || envelope.data.bucket.length === 0) {
    throw new ProviderError(
      "RuneScape Wiki returned no quest data; the previous local snapshot was retained",
      "EMPTY_PROVIDER_RESPONSE",
      true,
    );
  }
  try {
    return z.array(rowSchema).parse(envelope.data.bucket);
  } catch (error) {
    throw malformed("RuneScape Wiki Bucket rows failed validation", error);
  }
}

async function loadRevisions(
  httpClient: ResilientHttpClient,
  endpoint: string,
  titles: ReadonlyArray<string>,
): Promise<Map<string, PageRevision>> {
  const revisions = new Map<string, PageRevision>();
  for (let offset = 0; offset < titles.length; offset += 50) {
    const batch = titles.slice(offset, offset + 50);
    const payload = await responseJson(
      httpClient,
      apiUrl(endpoint, {
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "revisions",
        rvprop: "ids|timestamp|content",
        rvslots: "main",
        titles: batch.join("|"),
      }),
    );
    let parsed: z.infer<typeof RevisionsResponseSchema>;
    try {
      parsed = RevisionsResponseSchema.parse(payload);
    } catch (error) {
      throw malformed("RuneScape Wiki revision response failed validation", error);
    }
    for (const page of parsed.query.pages) {
      const revision = page.revisions[0];
      if (revision !== undefined) {
        revisions.set(pageKey(page.title), {
          revisionId: revision.revid,
          timestamp: revision.timestamp,
          content: revision.slots.main.content,
        });
      }
    }
  }
  return revisions;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class RuneScapeWikiQuestProvider implements QuestDataProvider {
  private readonly apiEndpoint: string;
  private readonly pageEndpoint: string;
  private readonly now: () => Date;

  public constructor(private readonly options: WikiQuestProviderOptions) {
    this.apiEndpoint = options.apiUrl ?? DEFAULT_API_URL;
    this.pageEndpoint = options.pageUrl ?? DEFAULT_PAGE_URL;
    this.now = options.now ?? (() => new Date());
  }

  public async fetchSnapshot() {
    const questQuery =
      "bucket('quest').select('page_name','page_name_sub','json','official_length','requirements','requirement_skill','requirement_skill_level').where(bucket.Not('Category:Removed quests')).orderBy('page_name_sub','asc').limit(5000).run()";
    const rewardQuery =
      "bucket('quest_rewards').select('page_name','page_name_sub','quest_points','rewards','post_rewards','music').where(bucket.Not('Category:Removed quests')).orderBy('page_name_sub','asc').limit(5000).run()";
    const infoboxQuery =
      "bucket('infobox_quest').select('page_name','page_name_sub','name','is_members_only','official_difficulty','official_combat','official_series','official_nth_in_series','quest_type','id').where(bucket.Not('Category:Removed quests')).orderBy('page_name_sub','asc').limit(5000).run()";

    const [questRows, rewardRows, infoboxRows, requirementRevisionMap] = await Promise.all([
      loadBucket(this.options.httpClient, this.apiEndpoint, questQuery, BucketQuestRowSchema),
      loadBucket(this.options.httpClient, this.apiEndpoint, rewardQuery, BucketRewardRowSchema),
      loadBucket(this.options.httpClient, this.apiEndpoint, infoboxQuery, BucketInfoboxRowSchema),
      loadRevisions(this.options.httpClient, this.apiEndpoint, [QUESTREQ_PAGE]),
    ]);
    const requirementRevision = requirementRevisionMap.get(pageKey(QUESTREQ_PAGE));
    if (requirementRevision === undefined) {
      throw malformed("RuneScape Wiki quest prerequisite revision was missing");
    }
    const prerequisiteData = parseQuestRequirementModule(requirementRevision.content);
    const pageNames = [...new Set(questRows.map((row) => row.page_name))];
    const pageRevisions = await loadRevisions(this.options.httpClient, this.apiEndpoint, pageNames);

    const rewardsByPage = new Map(rewardRows.map((row) => [pageKey(row.page_name_sub), row]));
    const infoboxByPage = new Map(infoboxRows.map((row) => [pageKey(row.page_name_sub), row]));
    const parsedRows = questRows.map((row) => ({
      row,
      details: parseQuestDetailsJson(row),
      id: canonicalQuestId(row.page_name_sub),
    }));
    const idByName = new Map<string, string>();
    for (const { row, details, id } of parsedRows) {
      const name = details.name ?? row.page_name_sub;
      for (const alias of [name, row.page_name, row.page_name_sub]) {
        idByName.set(pageKey(alias), id);
      }
    }

    const checkedAt = this.now().toISOString();
    const quests: Quest[] = parsedRows.map(({ row, details, id }) => {
      const key = pageKey(row.page_name_sub);
      const rewardRow = rewardsByPage.get(key);
      const infobox = infoboxByPage.get(key);
      const revision = pageRevisions.get(pageKey(row.page_name));
      if (revision === undefined) {
        throw malformed(`RuneScape Wiki revision was missing for ${row.page_name}`);
      }
      const name = details.name ?? infobox?.name ?? row.page_name_sub;
      const rawPrerequisites =
        prerequisiteData.get(name) ?? prerequisiteData.get(row.page_name_sub) ?? [];
      const prerequisites: QuestPrerequisite[] = [];
      const otherRequirements = parseOtherRequirements(row.requirements ?? details.requirements);
      for (const rawRequirement of rawPrerequisites) {
        if (rawRequirement.startsWith("Misc:")) {
          otherRequirements.push(cleanWikiText(rawRequirement.slice("Misc:".length)));
          continue;
        }
        const requiredStatus = rawRequirement.startsWith("Partial:")
          ? ("started" as const)
          : ("completed" as const);
        const requirementName = rawRequirement.replace(/^Partial:/, "");
        const questId = idByName.get(pageKey(requirementName));
        if (questId === undefined) {
          otherRequirements.push(`Quest prerequisite: ${cleanWikiText(requirementName)}`);
          continue;
        }
        prerequisites.push({ questId, requiredStatus });
      }
      const questPointReward = rewardRow?.quest_points ?? undefined;
      const sourcePageUrl = new URL(
        encodeURIComponent(row.page_name.replaceAll(" ", "_")),
        this.pageEndpoint,
      ).toString();
      const aliases = uniqueAliases([row.page_name, row.page_name_sub, id], name);
      const skillRequirements = parseSkillRequirements(row);
      const itemRequirements = parseQuestItems(details.items);
      const recommendedItems = parseQuestItems(details.recommended);
      const rewards = parseRewards(rewardRow, questPointReward);
      const parseWarnings: Quest["parseWarnings"] = [];
      if (asTextArray(row.requirement_skill).length > 0 && skillRequirements.length === 0) {
        parseWarnings.push({
          field: "skillRequirements",
          message: "The Wiki supplied skill requirement fields, but none could be structured.",
        });
      }
      if (details.items?.trim() && itemRequirements.length === 0) {
        parseWarnings.push({
          field: "itemRequirements",
          message: "The Wiki supplied required-item text, but none could be structured.",
        });
      }
      if (details.recommended?.trim() && recommendedItems.length === 0) {
        parseWarnings.push({
          field: "recommendedItems",
          message: "The Wiki supplied recommended-item text, but none could be structured.",
        });
      }
      if (
        (rewardRow?.rewards?.trim() || rewardRow?.post_rewards?.trim()) &&
        rewards.length === (questPointReward === undefined ? 0 : 1)
      ) {
        parseWarnings.push({
          field: "rewards",
          message:
            "The Wiki supplied reward text, but no non-quest-point reward could be structured.",
        });
      }
      const base = {
        id,
        name,
        aliases,
        members: infobox?.is_members_only ?? /^(?:yes|true)$/i.test(details.members ?? ""),
        ...(infobox?.official_difficulty === undefined || infobox.official_difficulty === null
          ? {}
          : { difficulty: infobox.official_difficulty }),
        ...(row.official_length === undefined || row.official_length === null
          ? details.length === undefined
            ? {}
            : { length: details.length }
          : { length: row.official_length }),
        ...(questPointReward === undefined ? {} : { questPointReward }),
        prerequisiteQuestIds: prerequisites.map((requirement) => requirement.questId),
        prerequisiteGroups:
          prerequisites.length === 0 ? [] : [{ mode: "all" as const, quests: prerequisites }],
        skillRequirements,
        ...(parseQuestPointRequirement(row) === undefined
          ? {}
          : { questPointRequirement: parseQuestPointRequirement(row) }),
        otherRequirements: [...new Set(otherRequirements.filter((value) => value.length > 0))],
        itemRequirements,
        recommendedItems,
        rewards,
        guideUrl: sourcePageUrl,
        sourcePageUrl,
        sourceName: WIKI_NAME,
        sourceRevision: `${revision.revisionId}:${requirementRevision.revisionId}`,
        sourceUpdatedAt: revision.timestamp,
        lastCheckedAt: checkedAt,
        parseWarnings,
      };
      return QuestSchema.parse({
        ...base,
        contentHash: stableHash({
          ...base,
          sourceRevision: undefined,
          sourceUpdatedAt: undefined,
          lastCheckedAt: undefined,
        }),
      });
    });

    const ids = new Set<string>();
    for (const quest of quests) {
      if (ids.has(quest.id)) {
        throw malformed(`RuneScape Wiki produced duplicate quest ID ${quest.id}`);
      }
      ids.add(quest.id);
    }
    const revisionDigest = stableHash({
      prerequisiteRevision: requirementRevision.revisionId,
      pages: [...pageRevisions.entries()]
        .map(([title, revision]) => [title, revision.revisionId])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    });
    const warningCounts: Record<string, number> = {};
    for (const warning of quests.flatMap((quest) => quest.parseWarnings)) {
      warningCounts[warning.field] = (warningCounts[warning.field] ?? 0) + 1;
    }
    const coverage = QuestCoverageReportSchema.parse({
      totalQuests: quests.length,
      questsWithPrerequisiteData: quests.filter(
        (quest) =>
          quest.prerequisiteGroups.length > 0 ||
          quest.otherRequirements.some((value) => value.startsWith("Quest prerequisite:")),
      ).length,
      questsWithSkillRequirements: quests.filter((quest) => quest.skillRequirements.length > 0)
        .length,
      questsWithItemRequirements: quests.filter((quest) => quest.itemRequirements.length > 0)
        .length,
      questsWithStructuredRewards: quests.filter((quest) => quest.rewards.length > 0).length,
      parseWarningsByField: warningCounts,
    });
    return QuestDataSnapshotSchema.parse({
      provider: WIKI_NAME,
      sourceUrl: new URL(
        encodeURIComponent(QUESTREQ_PAGE.replaceAll(" ", "_")),
        this.pageEndpoint,
      ).toString(),
      sourceRevision: `${requirementRevision.revisionId}:${revisionDigest}`,
      retrievedAt: checkedAt,
      quests,
      coverage,
    });
  }
}
