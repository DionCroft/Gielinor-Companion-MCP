import { describe, expect, it } from "vitest";

import { DEFAULT_OVERLAY_SETTINGS, type GuidancePack } from "../src/contracts.js";
import { OverlaySession } from "../src/session.js";

const guidance: GuidancePack = {
  schemaVersion: 1,
  targetQuest: { id: "target", name: "Target Quest" },
  steps: [{ id: "finish", title: "Verify completion", keywords: ["quest complete"] }],
};

const enabledSettings = {
  ...DEFAULT_OVERLAY_SETTINGS,
  enabled: true,
  fields: {
    questText: true,
    dialogue: false,
    completionSignals: true,
  },
};

function completionObservation() {
  return {
    source: "manual-paste" as const,
    capturedAt: "2026-07-23T12:00:00.000Z",
    text: "Quest complete: Target Quest",
  };
}

describe("overlay consent session", () => {
  it("requires explicit policy acknowledgement", () => {
    const session = new OverlaySession();
    expect(() => session.grantConsent(enabledSettings, false)).toThrow(
      "Read-only policy acknowledgement",
    );
  });

  it("requires at least one visible field", () => {
    const session = new OverlaySession();
    expect(() =>
      session.grantConsent(
        {
          ...enabledSettings,
          fields: { questText: false, dialogue: false, completionSignals: false },
        },
        true,
      ),
    ).toThrow("Select at least one visible field");
  });

  it("remains paused after consent until the player explicitly resumes", () => {
    const session = new OverlaySession();
    session.loadGuidance(guidance);
    session.grantConsent(enabledSettings, true);
    expect(session.ingest(completionObservation())).toMatchObject({
      signals: [],
      rejectedReason: "disabled",
    });
  });

  it("records a completion only as a local manual confirmation", () => {
    const session = new OverlaySession();
    session.loadGuidance(guidance);
    session.grantConsent(enabledSettings, true);
    session.resume();
    const result = session.ingest(completionObservation());
    const signal = result.signals.find((candidate) => candidate.kind === "probable-completion");
    expect(signal).toBeDefined();
    expect(session.confirmProgress(signal!.id)).toMatchObject({
      targetQuestId: "target",
      notice: "local-confirmation-only",
    });
    expect(session.snapshot().pendingConfirmationIds).toEqual([]);
  });

  it("allows a false positive to be dismissed without changing progress", () => {
    const session = new OverlaySession();
    session.loadGuidance(guidance);
    session.grantConsent(enabledSettings, true);
    session.resume();
    const signal = session.ingest(completionObservation()).signals[0]!;
    session.dismiss(signal.id);
    expect(session.snapshot().signals).not.toContainEqual(signal);
  });

  it("revokes consent and clears all session data", () => {
    const session = new OverlaySession();
    session.loadGuidance(guidance);
    session.grantConsent(enabledSettings, true);
    session.resume();
    session.ingest(completionObservation());
    session.revoke();
    expect(session.snapshot()).toMatchObject({
      settings: DEFAULT_OVERLAY_SETTINGS,
      paused: true,
      signals: [],
      pendingConfirmationIds: [],
    });
    expect(session.snapshot().guidance).toBeUndefined();
  });
});
