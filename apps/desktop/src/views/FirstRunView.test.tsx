import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { DemoCompanionBridge } from "../lib/bridge.js";
import type { DataStatus, ToolEnvelope } from "../types.js";
import { FirstRunView } from "./FirstRunView.js";

class PartialFirstRunBridge extends DemoCompanionBridge {
  public readonly calls: string[] = [];

  public override async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    this.calls.push(tool);
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
  it("shows all eleven stages and preserves partial success", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const bridge = new PartialFirstRunBridge("first-run");
    render(
      <FirstRunView
        bridge={bridge}
        runtime={{ ready: true, mode: "browser-preview", message: "Ready" }}
        onComplete={onComplete}
      />,
    );

    await user.type(screen.getByLabelText(/runescape display name/i), "Local Hero");
    await user.click(screen.getByRole("button", { name: /continue to companion/i }));

    expect(await screen.findByText("Validating local database")).toBeVisible();
    expect(screen.getByText("Creating player profile")).toBeVisible();
    expect(screen.getByText("Refreshing player statistics")).toBeVisible();
    expect(screen.getByText("Checking quest catalogue")).toBeVisible();
    expect(screen.getByText("Synchronising quest data")).toBeVisible();
    expect(screen.getByText("Checking training catalogue")).toBeVisible();
    expect(screen.getByText("Synchronising training data")).toBeVisible();
    expect(screen.getByText("Checking Grand Exchange catalogue")).toBeVisible();
    expect(screen.getByText("Synchronising Grand Exchange data")).toBeVisible();
    expect(screen.getByText("Validating snapshot coverage")).toBeVisible();
    expect(screen.getByText("Opening dashboard")).toBeVisible();
    expect(await screen.findByText(/GC-SYNC-001/)).toBeVisible();
    expect(screen.getByText(/2 of 3 catalogues ready/i)).toBeVisible();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(
      bridge.calls.filter((tool) =>
        [
          "get_quest_data_status",
          "refresh_quest_data",
          "get_training_data_status",
          "refresh_training_data",
          "get_price_data_status",
          "refresh_price_data",
        ].includes(tool),
      ),
    ).toEqual([
      "get_quest_data_status",
      "refresh_quest_data",
      "get_training_data_status",
      "refresh_training_data",
      "get_price_data_status",
      "refresh_price_data",
    ]);
  });
});
