// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/alt1-adapter.js", () => ({
  Alt1VisibleChatDriver: class {
    public identifyApplication(): void {}
    public capabilities() {
      return {
        installed: true,
        pixelPermission: true,
        overlayPermission: true,
        runeScapeLinked: true,
        version: "1.6.0",
        versionInt: 1_006_000,
        recommendedIntervalMs: 750,
      };
    }
    public readVisibleLines(): string[] {
      return [];
    }
    public annotateGuidance(): void {}
    public clear(): void {}
  },
}));

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

describe("overlay browser flow", () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <span id="status-indicator"></span>
      <strong id="status-title"></strong>
      <p id="status-detail"></p>
      <input id="field-quest" type="checkbox">
      <input id="field-dialogue" type="checkbox">
      <input id="field-completion" type="checkbox">
      <input id="policy-consent" type="checkbox">
      <textarea id="guidance-pack"></textarea>
      <p id="guide-status"></p>
      <textarea id="manual-text"></textarea>
      <div id="signal-list"></div>
      <button id="load-guide"></button>
      <button id="grant-consent"></button>
      <button id="connect-overlay"></button>
      <button id="pause-overlay"></button>
      <button id="disconnect-overlay"></button>
      <button id="revoke-consent"></button>
      <button id="analyse-manual"></button>
    `;
    localStorage.clear();
    await import("../src/main.js");
  });

  it("covers consent, opt-in, manual confirmation, disconnect, and complete revocation", async () => {
    expect(input("field-quest").checked).toBe(false);
    expect(document.getElementById("status-title")?.textContent).toBe("Overlay disconnected");

    input("field-quest").checked = true;
    input("field-completion").checked = true;
    input("policy-consent").checked = true;
    button("grant-consent").click();
    expect(document.getElementById("guide-status")?.textContent).toContain(
      "Capture remains paused",
    );

    button("connect-overlay").click();
    await vi.waitFor(() =>
      expect(document.getElementById("status-title")?.textContent).toBe(
        "Read-only overlay connected",
      ),
    );

    const manual = document.getElementById("manual-text") as HTMLTextAreaElement;
    manual.value = "Quest complete: Your target quest";
    button("analyse-manual").click();
    expect(document.getElementById("signal-list")?.textContent).toContain("probable completion");
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Confirm I saw this",
    );
    confirm?.click();
    expect(document.getElementById("signal-list")?.textContent).toContain(
      "Update quest progress manually",
    );

    button("disconnect-overlay").click();
    expect(document.getElementById("status-title")?.textContent).toBe("Overlay disconnected");

    button("revoke-consent").click();
    expect(input("field-quest").checked).toBe(false);
    expect(input("field-completion").checked).toBe(false);
    expect(localStorage.getItem("gielinor-overlay-preferences-v1")).toBeNull();
    expect(document.getElementById("signal-list")?.textContent).toContain("No guidance yet");
  });
});
