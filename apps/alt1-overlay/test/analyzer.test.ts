import { describe, expect, it } from "vitest";

import { analyzeObservation } from "../src/analyzer.js";
import {
  DEFAULT_OVERLAY_SETTINGS,
  type GuidancePack,
  type OverlayObservation,
  type OverlaySettings,
} from "../src/contracts.js";

const guidance: GuidancePack = {
  schemaVersion: 1,
  targetQuest: {
    id: "plagues-end",
    name: "Plague's End",
    sourceUrl: "https://runescape.wiki/w/Plague%27s_End",
  },
  steps: [
    {
      id: "speak-to-arianwyn",
      title: "Speak to Arianwyn",
      keywords: ["Arianwyn", "Prifddinas"],
      sourceUrl: "https://runescape.wiki/w/Plague%27s_End#Arianwyn",
    },
  ],
};

function observation(text: string, source: OverlayObservation["source"] = "alt1-visible-chat") {
  return {
    source,
    capturedAt: "2026-07-23T12:00:00.000Z",
    text,
  };
}

function settings(fields: Partial<OverlaySettings["fields"]> = {}): OverlaySettings {
  return {
    ...DEFAULT_OVERLAY_SETTINGS,
    enabled: true,
    fields: {
      questText: true,
      dialogue: true,
      completionSignals: true,
      ...fields,
    },
  };
}

describe("overlay observation analysis", () => {
  it("does nothing while disabled by default", () => {
    const result = analyzeObservation(
      observation("Quest complete: Plague's End"),
      guidance,
      DEFAULT_OVERLAY_SETTINGS,
    );
    expect(result).toEqual({ signals: [], rejectedReason: "disabled" });
  });

  it("matches guide keywords and labels locally captured source data", () => {
    const result = analyzeObservation(
      observation("Your objective is to speak to Arianwyn in Prifddinas."),
      guidance,
      settings(),
    );
    expect(result.signals[0]).toMatchObject({
      kind: "quest-text",
      guideStepId: "speak-to-arianwyn",
      sourceLabel: "Alt1 visible main chat · local OCR",
      requiresConfirmation: false,
    });
  });

  it("honours per-field visibility", () => {
    const result = analyzeObservation(
      observation('Arianwyn says "We should speak later."'),
      guidance,
      settings({ questText: false, completionSignals: false }),
    );
    expect(result.signals.map((signal) => signal.kind)).toEqual(["dialogue"]);
  });

  it("marks completion as probable and always requires manual confirmation", () => {
    const result = analyzeObservation(
      observation("Quest complete: Plague's End"),
      guidance,
      settings(),
    );
    const completion = result.signals.find((signal) => signal.kind === "probable-completion");
    expect(completion).toMatchObject({ confidence: 0.92, requiresConfirmation: true });
  });

  it("keeps ambiguous completion below high confidence", () => {
    const result = analyzeObservation(
      observation("You have completed a quest."),
      guidance,
      settings({ questText: false, dialogue: false }),
    );
    expect(result.signals[0]).toMatchObject({
      kind: "probable-completion",
      confidence: 0.55,
      requiresConfirmation: true,
    });
  });

  it("rejects player and private chat captured from the screen", () => {
    expect(
      analyzeObservation(observation("[12:00:01] Other Player: hello"), guidance, settings()),
    ).toEqual({ signals: [], rejectedReason: "player-chat" });
    expect(
      analyzeObservation(observation("From Other Player: secret"), guidance, settings()),
    ).toEqual({ signals: [], rejectedReason: "private-chat" });
  });

  it("redacts links, email addresses and long identifiers before display", () => {
    const result = analyzeObservation(
      observation(
        "Quest objective: visit https://example.test/path and email me@example.test token abcdefghijklmnopqrstuvwxyz123456",
        "manual-paste",
      ),
      guidance,
      settings({ dialogue: false, completionSignals: false }),
    );
    expect(result.signals[0]?.redactedExcerpt).toContain("[link redacted]");
    expect(result.signals[0]?.redactedExcerpt).toContain("[email redacted]");
    expect(result.signals[0]?.redactedExcerpt).toContain("[identifier redacted]");
    expect(result.signals[0]?.redactedExcerpt).not.toContain("example.test/path");
  });

  it("discards malformed and unsupported observations without throwing", () => {
    expect(analyzeObservation({ text: 42 }, guidance, settings())).toEqual({
      signals: [],
      rejectedReason: "malformed",
    });
    expect(analyzeObservation(observation("x"), guidance, settings())).toEqual({
      signals: [],
      rejectedReason: "unsupported",
    });
  });
});
