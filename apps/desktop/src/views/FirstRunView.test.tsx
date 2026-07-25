import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { DemoCompanionBridge } from "../lib/bridge.js";
import type { DataStatus, ToolEnvelope } from "../types.js";
import { FirstRunView } from "./FirstRunView.js";

class PartialFirstRunBridge extends DemoCompanionBridge {
  public override async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    if (
      tool === "get_quest_data_status" ||
      tool === "get_training_data_status" ||
      tool === "get_price_data_status"
    ) {
      return {
        data: { state: "never-synced" } as DataStatus as T,
        meta: { generatedAt: new Date().toISOString(), source: "test" },
      };
    }
    if (tool === "refresh_quest_data") {
      throw new Error("Injected quest provider outage");
    }
    return super.callTool<T>(tool, arguments_);
  }
}

describe("desktop first-run catalogue population", () => {
  it("shows all seven stages and preserves partial success", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <FirstRunView
        bridge={new PartialFirstRunBridge("first-run")}
        runtime={{ ready: true, mode: "browser-preview", message: "Ready" }}
        onComplete={onComplete}
      />,
    );

    await user.type(screen.getByLabelText(/runescape display name/i), "Local Hero");
    await user.click(screen.getByRole("button", { name: /continue to companion/i }));

    expect(await screen.findByText("Preparing local database")).toBeVisible();
    expect(screen.getByText("Refreshing player statistics")).toBeVisible();
    expect(screen.getByText("Synchronising quest catalogue")).toBeVisible();
    expect(screen.getByText("Synchronising training methods")).toBeVisible();
    expect(screen.getByText("Synchronising Grand Exchange item catalogue")).toBeVisible();
    expect(screen.getByText("Validating local data")).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(await screen.findByText(/GC-SYNC-001/)).toBeVisible();
    expect(screen.getByText(/2 of 3 catalogues ready/i)).toBeVisible();
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
