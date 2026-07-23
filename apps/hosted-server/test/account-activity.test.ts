import { describe, expect, it } from "vitest";

import { AccountActivityTracker } from "../src/account-activity.js";

describe("account activity tracker", () => {
  it("makes deletion exclusive and allows a safe retry", () => {
    const tracker = new AccountActivityTracker();

    expect(tracker.beginRequest("account-a")).toBe(true);
    expect(tracker.beginDeletion("account-a")).toBe(false);
    tracker.finishRequest("account-a");

    expect(tracker.beginDeletion("account-a")).toBe(true);
    expect(tracker.beginRequest("account-a")).toBe(false);
    tracker.cancelDeletion("account-a");
    expect(tracker.beginRequest("account-a")).toBe(true);
    tracker.finishRequest("account-a");
  });
});
