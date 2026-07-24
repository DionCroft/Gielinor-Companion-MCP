import { z } from "zod";

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Guide links must use HTTPS");

export const OverlayFieldVisibilitySchema = z
  .object({
    questText: z.boolean(),
    dialogue: z.boolean(),
    completionSignals: z.boolean(),
  })
  .strict();

export const OverlaySettingsSchema = z
  .object({
    enabled: z.boolean(),
    fields: OverlayFieldVisibilitySchema,
    captureIntervalMs: z.number().int().min(750).max(10_000),
    persistRawScreenText: z.literal(false),
  })
  .strict();

export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = Object.freeze({
  enabled: false,
  fields: {
    questText: false,
    dialogue: false,
    completionSignals: false,
  },
  captureIntervalMs: 1_500,
  persistRawScreenText: false,
});

export const GuidanceStepSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(180),
    keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
    sourceUrl: HttpsUrlSchema.optional(),
  })
  .strict();

export const GuidancePackSchema = z
  .object({
    schemaVersion: z.literal(1),
    targetQuest: z
      .object({
        id: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(180),
        sourceUrl: HttpsUrlSchema.optional(),
      })
      .strict(),
    steps: z.array(GuidanceStepSchema).min(1).max(50),
  })
  .strict();

export type GuidancePack = z.infer<typeof GuidancePackSchema>;

export const OverlayObservationSchema = z
  .object({
    source: z.enum(["alt1-visible-chat", "manual-paste"]),
    capturedAt: z.string().datetime(),
    text: z.string().min(1).max(1_000),
  })
  .strict();

export type OverlayObservation = z.infer<typeof OverlayObservationSchema>;

export const OverlaySignalSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["quest-text", "dialogue", "probable-completion"]),
    source: OverlayObservationSchema.shape.source,
    sourceLabel: z.string().min(1),
    capturedAt: z.string().datetime(),
    confidence: z.number().min(0).max(1),
    redactedExcerpt: z.string().min(1).max(280),
    recommendation: z.string().min(1).max(240),
    guideStepId: z.string().min(1).optional(),
    guideSourceUrl: HttpsUrlSchema.optional(),
    requiresConfirmation: z.boolean(),
  })
  .strict();

export type OverlaySignal = z.infer<typeof OverlaySignalSchema>;

export type ManualProgressConfirmation = {
  signalId: string;
  targetQuestId: string;
  confirmedAt: string;
  notice: "local-confirmation-only";
};

export const READ_ONLY_CAPABILITIES = Object.freeze({
  visiblePixelRead: true,
  unclickableGuidanceOverlay: true,
  networkTransmission: false,
  rawTextPersistence: false,
  gameplayInput: false,
  clientMemoryAccess: false,
  packetAccess: false,
});

export function assertReadOnlyCapabilities(): void {
  if (
    READ_ONLY_CAPABILITIES.gameplayInput ||
    READ_ONLY_CAPABILITIES.clientMemoryAccess ||
    READ_ONLY_CAPABILITIES.packetAccess ||
    READ_ONLY_CAPABILITIES.networkTransmission ||
    READ_ONLY_CAPABILITIES.rawTextPersistence
  ) {
    throw new Error("The overlay capability boundary is not read-only");
  }
}
