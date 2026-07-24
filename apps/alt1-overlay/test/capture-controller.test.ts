import { describe, expect, it, vi } from "vitest";

import {
  MINIMUM_ALT1_VERSION_INT,
  ReadOnlyCaptureController,
  type CaptureCapabilities,
  type CaptureStatus,
  type IntervalScheduler,
  type ReadOnlyCaptureDriver,
} from "../src/capture-controller.js";

class FakeDriver implements ReadOnlyCaptureDriver {
  public currentCapabilities: CaptureCapabilities = {
    installed: true,
    pixelPermission: true,
    overlayPermission: true,
    runeScapeLinked: true,
    version: "1.6.0",
    versionInt: MINIMUM_ALT1_VERSION_INT,
    recommendedIntervalMs: 750,
  };
  public lines: unknown = ["Quest objective updated"];
  public clearCalls = 0;
  public annotations: string[] = [];

  public capabilities(): unknown {
    return this.currentCapabilities;
  }

  public readVisibleLines(): unknown {
    return this.lines;
  }

  public annotateGuidance(message: string): void {
    this.annotations.push(message);
  }

  public clear(): void {
    this.clearCalls += 1;
  }
}

function harness() {
  const driver = new FakeDriver();
  const statuses: CaptureStatus[] = [];
  const onLines = vi.fn();
  let scheduled: (() => void) | undefined;
  const scheduler: IntervalScheduler = {
    set: (callback) => {
      scheduled = callback;
      return 1;
    },
    clear: vi.fn(),
  };
  const controller = new ReadOnlyCaptureController(
    driver,
    { onLines, onStatus: (status) => statuses.push(status) },
    scheduler,
  );
  return { driver, statuses, onLines, scheduler, controller, scheduled: () => scheduled };
}

describe("read-only Alt1 capture controller", () => {
  it("does not read without runtime consent", () => {
    const test = harness();
    expect(test.controller.start(false).state).toBe("consent-required");
    expect(test.onLines).not.toHaveBeenCalled();
  });

  it("rejects unsupported Alt1 versions", () => {
    const test = harness();
    test.driver.currentCapabilities.versionInt = MINIMUM_ALT1_VERSION_INT - 1;
    expect(test.controller.start(true).state).toBe("incompatible");
    expect(test.driver.clearCalls).toBeGreaterThan(0);
  });

  it("requires installation and pixel permission while keeping overlay optional", () => {
    const test = harness();
    test.driver.currentCapabilities.pixelPermission = false;
    expect(test.controller.start(true).state).toBe("permission-required");

    test.driver.currentCapabilities.pixelPermission = true;
    test.driver.currentCapabilities.overlayPermission = false;
    expect(test.controller.start(true).state).toBe("connected");
    test.controller.annotate("safe guidance");
    expect(test.driver.annotations).toEqual([]);
  });

  it("reports unsupported screens and recovers when RuneScape reconnects", () => {
    const test = harness();
    test.driver.currentCapabilities.runeScapeLinked = false;
    expect(test.controller.start(true).state).toBe("unsupported-screen");
    test.driver.currentCapabilities.runeScapeLinked = true;
    test.scheduled()?.();
    expect(test.controller.currentStatus().state).toBe("connected");
  });

  it("discards malformed capture payloads and recovers on the next event", () => {
    const test = harness();
    test.driver.lines = [{ text: "not a supported payload" }];
    expect(test.controller.start(true).state).toBe("malformed-capture");
    test.driver.lines = ["Quest objective updated"];
    test.scheduled()?.();
    expect(test.controller.currentStatus().state).toBe("connected");
    expect(test.onLines).toHaveBeenCalledWith(["Quest objective updated"]);
  });

  it("pauses safely when permission is revoked at runtime", () => {
    const test = harness();
    test.controller.start(true);
    test.driver.currentCapabilities.pixelPermission = false;
    test.scheduled()?.();
    expect(test.controller.currentStatus().state).toBe("permission-required");
    expect(test.driver.clearCalls).toBeGreaterThan(0);
  });

  it("supports disconnect and reconnect without retaining a capture binding", () => {
    const test = harness();
    test.controller.start(true);
    test.controller.stop();
    expect(test.controller.currentStatus().state).toBe("disconnected");
    expect(test.scheduler.clear).toHaveBeenCalled();
    expect(test.controller.start(true).state).toBe("connected");
  });

  it("truncates annotation text and only draws while connected", () => {
    const test = harness();
    test.controller.annotate("before connection");
    test.controller.start(true);
    test.controller.annotate("a".repeat(400));
    expect(test.driver.annotations).toEqual(["a".repeat(180)]);
  });
});
