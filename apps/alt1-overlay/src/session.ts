import {
  DEFAULT_OVERLAY_SETTINGS,
  GuidancePackSchema,
  OverlaySettingsSchema,
  type GuidancePack,
  type ManualProgressConfirmation,
  type OverlayObservation,
  type OverlaySettings,
  type OverlaySignal,
} from "./contracts.js";
import { analyzeObservation, type AnalysisResult } from "./analyzer.js";

export type OverlaySessionSnapshot = {
  settings: OverlaySettings;
  paused: boolean;
  guidance?: GuidancePack;
  signals: OverlaySignal[];
  pendingConfirmationIds: string[];
};

export class OverlaySession {
  private settings: OverlaySettings = structuredClone(DEFAULT_OVERLAY_SETTINGS);
  private guidance: GuidancePack | undefined;
  private readonly signals: OverlaySignal[] = [];
  private readonly pendingConfirmations = new Map<string, OverlaySignal>();
  private paused = true;

  public grantConsent(settingsInput: unknown, policyAccepted: boolean): void {
    const settings = OverlaySettingsSchema.parse(settingsInput);
    if (!policyAccepted) {
      throw new Error("Read-only policy acknowledgement is required");
    }
    if (
      !settings.fields.questText &&
      !settings.fields.dialogue &&
      !settings.fields.completionSignals
    ) {
      throw new Error("Select at least one visible field");
    }
    this.settings = OverlaySettingsSchema.parse({
      ...settings,
      enabled: true,
      persistRawScreenText: false,
    });
    this.paused = true;
  }

  public loadGuidance(input: unknown): GuidancePack {
    this.guidance = GuidancePackSchema.parse(input);
    return this.guidance;
  }

  public resume(): void {
    if (!this.settings.enabled) {
      throw new Error("Consent is required before the overlay can run");
    }
    if (this.guidance === undefined) {
      throw new Error("Load a valid guidance pack before the overlay can run");
    }
    this.paused = false;
  }

  public pause(): void {
    this.paused = true;
  }

  public revoke(): void {
    this.settings = structuredClone(DEFAULT_OVERLAY_SETTINGS);
    this.guidance = undefined;
    this.paused = true;
    this.signals.splice(0);
    this.pendingConfirmations.clear();
  }

  public ingest(observation: OverlayObservation): AnalysisResult {
    if (this.guidance === undefined) {
      return { signals: [], rejectedReason: "disabled" };
    }
    const result = analyzeObservation(
      observation,
      this.guidance,
      this.paused ? { ...this.settings, enabled: false } : this.settings,
    );
    for (const candidate of result.signals) {
      const duplicate = this.signals.some(
        (existing) =>
          existing.kind === candidate.kind &&
          existing.redactedExcerpt === candidate.redactedExcerpt,
      );
      if (duplicate) {
        continue;
      }
      this.signals.unshift(candidate);
      if (candidate.requiresConfirmation) {
        this.pendingConfirmations.set(candidate.id, candidate);
      }
    }
    this.signals.splice(20);
    return result;
  }

  public confirmProgress(signalId: string): ManualProgressConfirmation {
    const signal = this.pendingConfirmations.get(signalId);
    if (signal === undefined || this.guidance === undefined) {
      throw new Error("This completion signal is not pending confirmation");
    }
    this.pendingConfirmations.delete(signalId);
    return {
      signalId,
      targetQuestId: this.guidance.targetQuest.id,
      confirmedAt: new Date().toISOString(),
      notice: "local-confirmation-only",
    };
  }

  public dismiss(signalId: string): void {
    this.pendingConfirmations.delete(signalId);
    const index = this.signals.findIndex((signal) => signal.id === signalId);
    if (index !== -1) {
      this.signals.splice(index, 1);
    }
  }

  public snapshot(): OverlaySessionSnapshot {
    return {
      settings: structuredClone(this.settings),
      paused: this.paused,
      ...(this.guidance === undefined ? {} : { guidance: structuredClone(this.guidance) }),
      signals: structuredClone(this.signals),
      pendingConfirmationIds: [...this.pendingConfirmations.keys()],
    };
  }
}
