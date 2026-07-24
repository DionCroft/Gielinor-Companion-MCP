import "./styles.css";

import { ReadOnlyCaptureController, type CaptureStatus } from "./capture-controller.js";
import {
  DEFAULT_OVERLAY_SETTINGS,
  GuidancePackSchema,
  assertReadOnlyCapabilities,
  type GuidancePack,
  type OverlayObservation,
  type OverlaySignal,
} from "./contracts.js";
import { OverlaySession } from "./session.js";

const STORAGE_KEY = "gielinor-overlay-preferences-v1";

const STARTER_GUIDANCE: GuidancePack = {
  schemaVersion: 1,
  targetQuest: {
    id: "replace-with-target-quest",
    name: "Your target quest",
  },
  steps: [
    {
      id: "meet-the-quest-giver",
      title: "Meet the quest giver and review the objective",
      keywords: ["quest started", "objective", "journal"],
    },
    {
      id: "follow-current-clue",
      title: "Follow the current clue in the trusted quest guide",
      keywords: ["speak to", "talk to", "search", "investigate"],
    },
    {
      id: "confirm-completion",
      title: "Verify the completion screen and update the companion manually",
      keywords: ["quest complete", "quest points gained", "you have completed"],
    },
  ],
};

type SafePreferences = {
  fields: {
    questText: boolean;
    dialogue: boolean;
    completionSignals: boolean;
  };
  guidance: GuidancePack;
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`Missing required element: ${id}`);
  }
  return found as T;
}

const questField = element<HTMLInputElement>("field-quest");
const dialogueField = element<HTMLInputElement>("field-dialogue");
const completionField = element<HTMLInputElement>("field-completion");
const policyConsent = element<HTMLInputElement>("policy-consent");
const guideText = element<HTMLTextAreaElement>("guidance-pack");
const guideStatus = element<HTMLParagraphElement>("guide-status");
const manualText = element<HTMLTextAreaElement>("manual-text");
const signalList = element<HTMLDivElement>("signal-list");
const statusIndicator = element<HTMLSpanElement>("status-indicator");
const statusTitle = element<HTMLElement>("status-title");
const statusDetail = element<HTMLParagraphElement>("status-detail");

const session = new OverlaySession();
let controller: ReadOnlyCaptureController | undefined;
let controllerPromise: Promise<ReadOnlyCaptureController> | undefined;
let lastConfirmationNotice = "";

function safePreferences(): SafePreferences {
  const fallback: SafePreferences = {
    fields: structuredClone(DEFAULT_OVERLAY_SETTINGS.fields),
    guidance: structuredClone(STARTER_GUIDANCE),
  };
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === null) {
      return fallback;
    }
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("fields" in parsed)) {
      return fallback;
    }
    const fields = (parsed as SafePreferences).fields;
    const guidance = GuidancePackSchema.safeParse((parsed as SafePreferences).guidance);
    if (
      typeof fields?.questText !== "boolean" ||
      typeof fields.dialogue !== "boolean" ||
      typeof fields.completionSignals !== "boolean" ||
      !guidance.success
    ) {
      return fallback;
    }
    return { fields, guidance: guidance.data };
  } catch {
    return fallback;
  }
}

function saveSafePreferences(guidance: GuidancePack): void {
  const value: SafePreferences = {
    fields: {
      questText: questField.checked,
      dialogue: dialogueField.checked,
      completionSignals: completionField.checked,
    },
    guidance,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function setStatus(status: CaptureStatus): void {
  const titles: Record<CaptureStatus["state"], string> = {
    disconnected: "Overlay disconnected",
    connected: "Read-only overlay connected",
    "consent-required": "Consent required",
    "permission-required": "Alt1 permission required",
    incompatible: "Unsupported Alt1 version",
    "unsupported-screen": "Visible chat unavailable",
    "malformed-capture": "Capture discarded",
    "capture-error": "Capture paused safely",
  };
  statusTitle.textContent = titles[status.state];
  statusDetail.textContent = status.detail;
  statusIndicator.dataset.state = status.state;
}

function observation(text: string, source: OverlayObservation["source"]): OverlayObservation {
  return {
    source,
    capturedAt: new Date().toISOString(),
    text,
  };
}

function recordLines(lines: string[], source: OverlayObservation["source"]): void {
  for (const line of lines) {
    const result = session.ingest(observation(line, source));
    for (const signal of result.signals) {
      controller?.annotate(signal.recommendation);
    }
  }
  renderSignals();
}

function captureController(): Promise<ReadOnlyCaptureController> {
  controllerPromise ??= import("./alt1-adapter.js")
    .then(({ Alt1VisibleChatDriver }) => {
      controller = new ReadOnlyCaptureController(new Alt1VisibleChatDriver(), {
        onLines: (lines) => recordLines(lines, "alt1-visible-chat"),
        onStatus: setStatus,
      });
      return controller;
    })
    .catch((error: unknown) => {
      controllerPromise = undefined;
      throw error;
    });
  return controllerPromise;
}

function guideFromEditor(): GuidancePack {
  return GuidancePackSchema.parse(JSON.parse(guideText.value) as unknown);
}

function renderSignals(): void {
  const snapshot = session.snapshot();
  signalList.replaceChildren();
  if (lastConfirmationNotice.length > 0) {
    const notice = document.createElement("p");
    notice.className = "confirmation-notice";
    notice.textContent = lastConfirmationNotice;
    signalList.append(notice);
  }
  if (snapshot.signals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No guidance yet.";
    signalList.append(empty);
    return;
  }
  for (const signal of snapshot.signals) {
    signalList.append(renderSignal(signal, snapshot.pendingConfirmationIds.includes(signal.id)));
  }
}

function renderSignal(signal: OverlaySignal, pending: boolean): HTMLElement {
  const article = document.createElement("article");
  article.className = `signal signal-${signal.kind}`;

  const meta = document.createElement("p");
  meta.className = "signal-meta";
  meta.textContent = `${signal.kind.replaceAll("-", " ")} · ${Math.round(
    signal.confidence * 100,
  )}% confidence · ${signal.sourceLabel}`;

  const excerpt = document.createElement("blockquote");
  excerpt.textContent = signal.redactedExcerpt;

  const recommendation = document.createElement("p");
  recommendation.className = "recommendation";
  recommendation.textContent = signal.recommendation;

  article.append(meta, excerpt, recommendation);

  if (signal.guideSourceUrl !== undefined) {
    const link = document.createElement("a");
    link.href = signal.guideSourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open guide source";
    article.append(link);
  }

  if (signal.requiresConfirmation && pending) {
    const row = document.createElement("div");
    row.className = "button-row";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Confirm I saw this";
    confirm.addEventListener("click", () => {
      session.confirmProgress(signal.id);
      lastConfirmationNotice =
        "Confirmed for this session only. Update quest progress manually in Gielinor Companion.";
      renderSignals();
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "False positive";
    dismiss.addEventListener("click", () => {
      session.dismiss(signal.id);
      lastConfirmationNotice = "Signal dismissed. No quest or game state was changed.";
      renderSignals();
    });
    row.append(confirm, dismiss);
    article.append(row);
  }
  return article;
}

function loadGuide(showSuccess: boolean): GuidancePack | undefined {
  try {
    const guidance = session.loadGuidance(guideFromEditor());
    saveSafePreferences(guidance);
    guideStatus.textContent = showSuccess
      ? `${guidance.steps.length} local guide steps loaded for ${guidance.targetQuest.name}.`
      : "";
    guideStatus.dataset.state = "success";
    return guidance;
  } catch {
    guideStatus.textContent =
      "The guidance pack is invalid. Use schema version 1, one target quest and 1–50 steps.";
    guideStatus.dataset.state = "error";
    return undefined;
  }
}

function applyStoredPreferences(): void {
  const stored = safePreferences();
  questField.checked = stored.fields.questText;
  dialogueField.checked = stored.fields.dialogue;
  completionField.checked = stored.fields.completionSignals;
  guideText.value = JSON.stringify(stored.guidance, null, 2);
  session.loadGuidance(stored.guidance);
}

element<HTMLButtonElement>("load-guide").addEventListener("click", () => {
  loadGuide(true);
});

element<HTMLButtonElement>("grant-consent").addEventListener("click", () => {
  const guidance = loadGuide(false);
  if (guidance === undefined) {
    return;
  }
  try {
    session.grantConsent(
      {
        enabled: true,
        fields: {
          questText: questField.checked,
          dialogue: dialogueField.checked,
          completionSignals: completionField.checked,
        },
        captureIntervalMs: 1_500,
        persistRawScreenText: false,
      },
      policyConsent.checked,
    );
    guideStatus.textContent =
      "Consent recorded for this runtime. Capture remains paused until you connect.";
    guideStatus.dataset.state = "success";
    setStatus({
      state: "disconnected",
      detail: "Enabled fields are ready, but no visible pixels are being read.",
    });
  } catch (error) {
    guideStatus.textContent =
      error instanceof Error ? error.message : "Consent could not be saved.";
    guideStatus.dataset.state = "error";
  }
});

element<HTMLButtonElement>("connect-overlay").addEventListener("click", async () => {
  try {
    session.resume();
    const activeController = await captureController();
    const snapshot = session.snapshot();
    if (!snapshot.settings.enabled || snapshot.paused) {
      activeController.stop(false);
      return;
    }
    activeController.start(true, snapshot.settings.captureIntervalMs);
  } catch (error) {
    setStatus({
      state: "consent-required",
      detail: error instanceof Error ? error.message : "Consent and a guide are required.",
    });
  }
});

element<HTMLButtonElement>("pause-overlay").addEventListener("click", () => {
  session.pause();
  controller?.stop();
  setStatus({
    state: "disconnected",
    detail: "Paused. No visible pixels are being read; consent remains available for reconnect.",
  });
});

element<HTMLButtonElement>("disconnect-overlay").addEventListener("click", () => {
  session.pause();
  controller?.stop();
});

element<HTMLButtonElement>("revoke-consent").addEventListener("click", () => {
  controller?.stop();
  session.revoke();
  localStorage.removeItem(STORAGE_KEY);
  policyConsent.checked = false;
  questField.checked = false;
  dialogueField.checked = false;
  completionField.checked = false;
  guideText.value = JSON.stringify(STARTER_GUIDANCE, null, 2);
  lastConfirmationNotice = "";
  renderSignals();
  setStatus({
    state: "disconnected",
    detail: "Consent, local preferences and session guidance were cleared.",
  });
});

element<HTMLButtonElement>("analyse-manual").addEventListener("click", () => {
  const value = manualText.value.trim();
  if (value.length === 0) {
    return;
  }
  try {
    session.resume();
    recordLines([value], "manual-paste");
    manualText.value = "";
  } catch (error) {
    guideStatus.textContent =
      error instanceof Error ? error.message : "Enable fields and load a guide first.";
    guideStatus.dataset.state = "error";
  }
});

window.addEventListener("beforeunload", () => controller?.stop(false));

assertReadOnlyCapabilities();
applyStoredPreferences();
window.alt1?.identifyAppUrl("./appconfig.json");
renderSignals();
setStatus({
  state: "disconnected",
  detail:
    window.alt1 === undefined
      ? "Alt1 was not detected. The manual fallback remains available."
      : "No screen pixels are being read.",
});
