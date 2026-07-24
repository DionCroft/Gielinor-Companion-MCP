import {
  GuidancePackSchema,
  OverlayObservationSchema,
  OverlaySettingsSchema,
  OverlaySignalSchema,
  type GuidancePack,
  type OverlayObservation,
  type OverlaySignal,
} from "./contracts.js";
import { sanitizeVisibleText } from "./privacy.js";

export type AnalysisResult = {
  signals: OverlaySignal[];
  rejectedReason?:
    | "disabled"
    | "malformed"
    | "empty"
    | "player-chat"
    | "private-chat"
    | "unsupported"
    | "no-enabled-signal";
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableId(observation: OverlayObservation, kind: OverlaySignal["kind"]): string {
  const input = `${kind}|${observation.capturedAt}|${observation.source}|${observation.text}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${kind}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function bestStep(
  text: string,
  pack: GuidancePack,
): { step: GuidancePack["steps"][number]; matches: number } | undefined {
  const normalized = normalize(text);
  let best: { step: GuidancePack["steps"][number]; matches: number } | undefined;
  for (const step of pack.steps) {
    const matches = step.keywords.filter((keyword) =>
      normalized.includes(normalize(keyword)),
    ).length;
    if (matches > 0 && (best === undefined || matches > best.matches)) {
      best = { step, matches };
    }
  }
  return best;
}

function sourceLabel(source: OverlayObservation["source"]): string {
  return source === "alt1-visible-chat"
    ? "Alt1 visible main chat · local OCR"
    : "Manual text · local analysis";
}

function signal(
  observation: OverlayObservation,
  kind: OverlaySignal["kind"],
  excerpt: string,
  confidence: number,
  pack: GuidancePack,
  stepMatch: ReturnType<typeof bestStep>,
): OverlaySignal {
  const step = stepMatch?.step;
  const recommendation =
    step === undefined
      ? `Review the current ${pack.targetQuest.name} guide step and confirm the context yourself.`
      : `Suggested guide step: ${step.title}`;
  return OverlaySignalSchema.parse({
    id: stableId(observation, kind),
    kind,
    source: observation.source,
    sourceLabel: sourceLabel(observation.source),
    capturedAt: observation.capturedAt,
    confidence,
    redactedExcerpt: excerpt,
    recommendation,
    ...(step === undefined ? {} : { guideStepId: step.id }),
    ...(step?.sourceUrl === undefined
      ? pack.targetQuest.sourceUrl === undefined
        ? {}
        : { guideSourceUrl: pack.targetQuest.sourceUrl }
      : { guideSourceUrl: step.sourceUrl }),
    requiresConfirmation: kind === "probable-completion",
  });
}

export function analyzeObservation(
  observationInput: unknown,
  guidanceInput: unknown,
  settingsInput: unknown,
): AnalysisResult {
  const observationResult = OverlayObservationSchema.safeParse(observationInput);
  const guidanceResult = GuidancePackSchema.safeParse(guidanceInput);
  const settingsResult = OverlaySettingsSchema.safeParse(settingsInput);
  if (!observationResult.success || !guidanceResult.success || !settingsResult.success) {
    return { signals: [], rejectedReason: "malformed" };
  }

  const observation = observationResult.data;
  const pack = guidanceResult.data;
  const settings = settingsResult.data;
  if (!settings.enabled) {
    return { signals: [], rejectedReason: "disabled" };
  }

  const sanitized = sanitizeVisibleText(observation.text, observation.source);
  if (!sanitized.accepted) {
    return { signals: [], rejectedReason: sanitized.reason };
  }

  const text = normalize(sanitized.text);
  const targetName = normalize(pack.targetQuest.name);
  const stepMatch = bestStep(sanitized.text, pack);
  const mentionsTarget = targetName.length > 1 && text.includes(targetName);
  const completionLike =
    /\b(?:quest complete|quest completed|you have completed|completed quest|quest points? gained)\b/.test(
      text,
    );
  const dialogueLike =
    /\b(?:says?|said|asks?|tells?|speak to|talk to|reply|respond)\b/.test(text) ||
    /["“”]/.test(sanitized.text);
  const questLike =
    mentionsTarget ||
    stepMatch !== undefined ||
    /\b(?:quest|journal|objective|adventure|task|chapter)\b/.test(text);
  const signals: OverlaySignal[] = [];

  if (completionLike && settings.fields.completionSignals) {
    signals.push(
      signal(
        observation,
        "probable-completion",
        sanitized.text,
        mentionsTarget ? 0.92 : 0.55,
        pack,
        stepMatch,
      ),
    );
  }
  if (questLike && settings.fields.questText) {
    signals.push(
      signal(
        observation,
        "quest-text",
        sanitized.text,
        Math.min(0.9, 0.55 + (mentionsTarget ? 0.2 : 0) + (stepMatch?.matches ?? 0) * 0.05),
        pack,
        stepMatch,
      ),
    );
  }
  if (dialogueLike && settings.fields.dialogue) {
    signals.push(signal(observation, "dialogue", sanitized.text, 0.6, pack, stepMatch));
  }

  return signals.length === 0 ? { signals, rejectedReason: "no-enabled-signal" } : { signals };
}
