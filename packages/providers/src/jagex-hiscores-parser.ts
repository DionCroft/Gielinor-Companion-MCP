import { PlayerSkillSchema, SKILL_IDS, type PlayerSkill } from "@gielinor/shared-types";

function parseInteger(value: string | undefined, field: string): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new TypeError(`Jagex Hiscores returned a malformed ${field} value`);
  }
  return Number(value);
}

export function parseHiscoresCsv(body: string): PlayerSkill[] {
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < SKILL_IDS.length + 1) {
    throw new TypeError("Jagex Hiscores returned fewer skill rows than expected");
  }

  return SKILL_IDS.map((skillId, index) => {
    const columns = lines[index + 1]?.split(",");
    if (columns === undefined || columns.length !== 3) {
      throw new TypeError(`Jagex Hiscores returned a malformed row for ${skillId}`);
    }

    const rank = parseInteger(columns[0], "rank");
    const level = parseInteger(columns[1], "level");
    const experience = parseInteger(columns[2], "experience");
    const parsed = PlayerSkillSchema.safeParse({ skillId, rank, level, experience });
    if (!parsed.success) {
      throw new TypeError(`Jagex Hiscores returned invalid values for ${skillId}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  });
}
