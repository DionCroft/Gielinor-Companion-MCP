import ChatBoxReader from "alt1/chatbox";

import type { CaptureCapabilities, ReadOnlyCaptureDriver } from "./capture-controller.js";

const OVERLAY_GROUP = "gielinor-companion-guidance";
const GUIDANCE_COLOUR = -1;

export class Alt1VisibleChatDriver implements ReadOnlyCaptureDriver {
  private readonly reader = new ChatBoxReader();

  public identifyApplication(): void {
    window.alt1?.identifyAppUrl("./appconfig.json");
  }

  public capabilities(): CaptureCapabilities {
    const api = window.alt1;
    return {
      installed: api?.permissionInstalled === true,
      pixelPermission: api?.permissionPixel === true,
      overlayPermission: api?.permissionOverlay === true,
      runeScapeLinked: api?.rsLinked === true,
      version: api?.version ?? "not-detected",
      versionInt: api?.versionint ?? 0,
      recommendedIntervalMs: Math.max(750, api?.captureInterval ?? 1_500),
    };
  }

  public readVisibleLines(): string[] {
    if (this.reader.pos === null && this.reader.find() === null) {
      return [];
    }
    return (this.reader.read() ?? []).map((line) => line.text).filter((line) => line.length > 0);
  }

  public annotateGuidance(message: string): void {
    const api = window.alt1;
    if (api?.permissionOverlay !== true) {
      return;
    }
    api.overLaySetGroup(OVERLAY_GROUP);
    api.overLayText(
      `Gielinor guidance: ${message}`,
      GUIDANCE_COLOUR,
      16,
      Math.max(20, Math.round(api.rsWidth / 2)),
      72,
      4_000,
    );
  }

  public clear(): void {
    const api = window.alt1;
    api?.overLayClearGroup(OVERLAY_GROUP);
    if (api?.permissionInstalled === true) {
      api.clearBinds();
    }
    this.reader.pos = null;
  }
}
