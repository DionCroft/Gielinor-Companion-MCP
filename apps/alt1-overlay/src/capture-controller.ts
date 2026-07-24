import { z } from "zod";

export const MINIMUM_ALT1_VERSION = "1.6.0";
export const MINIMUM_ALT1_VERSION_INT = 1_006_000;

export const CaptureCapabilitiesSchema = z
  .object({
    installed: z.boolean(),
    pixelPermission: z.boolean(),
    overlayPermission: z.boolean(),
    runeScapeLinked: z.boolean(),
    version: z.string().min(1),
    versionInt: z.number().int().nonnegative(),
    recommendedIntervalMs: z.number().int().min(50).max(60_000),
  })
  .strict();

export type CaptureCapabilities = z.infer<typeof CaptureCapabilitiesSchema>;

const VisibleLinesSchema = z.array(z.string().min(1).max(1_000)).max(20);

export type CaptureState =
  | "disconnected"
  | "connected"
  | "consent-required"
  | "permission-required"
  | "incompatible"
  | "unsupported-screen"
  | "malformed-capture"
  | "capture-error";

export type CaptureStatus = {
  state: CaptureState;
  detail: string;
  capabilities?: CaptureCapabilities;
};

export interface ReadOnlyCaptureDriver {
  capabilities(): unknown;
  readVisibleLines(): unknown;
  annotateGuidance(message: string): void;
  clear(): void;
}

export interface IntervalScheduler {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

const browserScheduler: IntervalScheduler = {
  set: (callback, milliseconds) => window.setInterval(callback, milliseconds),
  clear: (handle) => window.clearInterval(handle as number),
};

export type CaptureCallbacks = {
  onLines(lines: string[]): void;
  onStatus(status: CaptureStatus): void;
};

export class ReadOnlyCaptureController {
  private handle: unknown;
  private status: CaptureStatus = {
    state: "disconnected",
    detail: "No visible pixels are being read.",
  };

  public constructor(
    private readonly driver: ReadOnlyCaptureDriver,
    private readonly callbacks: CaptureCallbacks,
    private readonly scheduler: IntervalScheduler = browserScheduler,
  ) {}

  public start(consentEnabled: boolean, requestedIntervalMs = 1_500): CaptureStatus {
    this.stop(false);
    if (!consentEnabled) {
      return this.update("consent-required", "Enable at least one visible field first.");
    }
    this.tick();
    if (
      this.status.state === "incompatible" ||
      this.status.state === "permission-required" ||
      this.status.state === "consent-required"
    ) {
      return this.status;
    }
    const capabilities = CaptureCapabilitiesSchema.safeParse(this.driver.capabilities());
    const interval = capabilities.success
      ? Math.max(requestedIntervalMs, capabilities.data.recommendedIntervalMs)
      : requestedIntervalMs;
    this.handle = this.scheduler.set(() => this.tick(), interval);
    return this.status;
  }

  public stop(notify = true): void {
    if (this.handle !== undefined) {
      this.scheduler.clear(this.handle);
      this.handle = undefined;
    }
    this.driver.clear();
    this.status = {
      state: "disconnected",
      detail: "No visible pixels are being read.",
    };
    if (notify) {
      this.callbacks.onStatus(this.status);
    }
  }

  public annotate(message: string): void {
    if (this.status.state === "connected" && this.status.capabilities?.overlayPermission === true) {
      this.driver.annotateGuidance(message.slice(0, 180));
    }
  }

  public currentStatus(): CaptureStatus {
    return structuredClone(this.status);
  }

  public tick(): void {
    const capabilityResult = CaptureCapabilitiesSchema.safeParse(this.driver.capabilities());
    if (!capabilityResult.success) {
      this.update("capture-error", "Alt1 returned invalid capability information.");
      return;
    }
    const capabilities = capabilityResult.data;
    if (capabilities.versionInt < MINIMUM_ALT1_VERSION_INT) {
      this.driver.clear();
      this.update(
        "incompatible",
        `Alt1 ${MINIMUM_ALT1_VERSION} or newer is required; detected ${capabilities.version}.`,
        capabilities,
      );
      return;
    }
    if (!capabilities.installed || !capabilities.pixelPermission) {
      this.driver.clear();
      this.update(
        "permission-required",
        "Install the app and grant only Screen pixels; Overlay is optional.",
        capabilities,
      );
      return;
    }
    if (!capabilities.runeScapeLinked) {
      this.driver.clear();
      this.update(
        "unsupported-screen",
        "RuneScape or its visible main chat could not be found. Manual mode remains available.",
        capabilities,
      );
      return;
    }

    try {
      const linesResult = VisibleLinesSchema.safeParse(this.driver.readVisibleLines());
      if (!linesResult.success) {
        this.update(
          "malformed-capture",
          "Captured text was malformed and was discarded.",
          capabilities,
        );
        return;
      }
      this.update(
        "connected",
        "Reading visible main-chat pixels locally. No raw text is stored or transmitted.",
        capabilities,
      );
      if (linesResult.data.length > 0) {
        this.callbacks.onLines(linesResult.data);
      }
    } catch {
      this.update(
        "capture-error",
        "The visible chat reader failed safely. Try reconnecting or use manual mode.",
        capabilities,
      );
    }
  }

  private update(
    state: CaptureState,
    detail: string,
    capabilities?: CaptureCapabilities,
  ): CaptureStatus {
    this.status = {
      state,
      detail,
      ...(capabilities === undefined ? {} : { capabilities }),
    };
    this.callbacks.onStatus(this.status);
    return this.status;
  }
}
